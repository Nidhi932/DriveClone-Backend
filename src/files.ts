import { Router } from 'express';
import multer from 'multer';
import { supabase } from './supabaseClient.js';
import { authMiddleware } from './middleware.js';

const router = Router();
const upload = multer({ storage: multer.memoryStorage() }); // Store file in memory

router.post('/upload', authMiddleware, upload.single('file'), async (req, res) => {
  const file = req.file;
  const user = (req as any).user;
  const { folderId } = req.body; // Can be null for root folder

  if (!file) {
    return res.status(400).json({ error: 'No file uploaded.' });
  }

  const filePath = `${user.id}/${Date.now()}-${file.originalname}`;

  // 1. Upload file to Supabase Storage
  const { error: uploadError } = await supabase.storage
    .from('files')
    .upload(filePath, file.buffer, {
      contentType: file.mimetype,
    });

  if (uploadError) {
    return res.status(500).json({ error: uploadError.message });
  }

  // 2. Save file metadata to the database
  const { data, error: dbError } = await supabase
    .from('files')
    .insert({
      name: file.originalname,
      owner_id: user.id,
      folder_id: folderId || null,
      storage_path: filePath,
      file_type: file.mimetype,
      size: file.size,
    })
    .select()
    .single();

  if (dbError) {
    return res.status(500).json({ error: dbError.message });
  }

  res.status(201).json(data);
});

router.get('/', authMiddleware, async (req, res) => {
  const user = (req as any).user;

  const { data, error } = await supabase
    .from('files')
    .select('*')
    .eq('owner_id', user.id);

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  res.status(200).json(data);
});

// Add this to your src/files.ts file

// CREATE A NEW FOLDER
router.post('/folders', authMiddleware, async (req, res) => {
  const user = (req as any).user;
  const { name, parentFolderId } = req.body; // parentFolderId can be null for root

  if (!name) {
    return res.status(400).json({ error: 'Folder name is required.' });
  }

  const { data, error } = await supabase
    .from('folders')
    .insert({
      name: name,
      owner_id: user.id,
      parent_folder_id: parentFolderId || null,
    })
    .select()
    .single();

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  res.status(201).json(data);
});

// GET CONTENTS OF A FOLDER (OR ROOT)
// REPLACE the old '/contents' route in src/files.ts with this one



// src/files.ts

router.get('/contents', authMiddleware, async (req, res) => {
    const user = (req as any).user;
    const folderId = req.query.folderId as string | undefined;
    const sortBy = (req.query.sortBy as string) || 'name'; // Default sort by name
    const sortOrder = (req.query.sortOrder as string) || 'asc'; // Default ascending

    try {
        const { data, error } = await supabase.rpc('get_folder_contents', {
            p_folder_id: folderId || null,
            p_user_id: user.id
        });

        if (error) throw error;

        // Perform sorting in the backend after fetching
        const sortedData = [...data].sort((a, b) => {
            // Always show folders first
            if (a.type === 'folder' && b.type !== 'folder') return -1;
            if (a.type !== 'folder' && b.type === 'folder') return 1;

            const valA = sortBy === 'name' ? a.name.toLowerCase() : new Date(a.created_at).getTime();
            const valB = sortBy === 'name' ? b.name.toLowerCase() : new Date(b.created_at).getTime();

            if (valA < valB) return sortOrder === 'asc' ? -1 : 1;
            if (valA > valB) return sortOrder === 'asc' ? 1 : -1;
            return 0;
        });

        res.status(200).json(sortedData);

    } catch (error) {
        console.error("Error fetching contents:", error);
        res.status(500).json("error occur");
    }
});

// Add this route to your src/files.ts file

router.post('/signed-url', authMiddleware, async (req, res) => {
  const { path } = req.body;

  if (!path) {
    return res.status(400).json({ error: 'File path is required.' });
  }

  // Generate a URL that is valid for 60 seconds
  const { data, error } = await supabase.storage
    .from('files')
    .createSignedUrl(path, 60); 

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  res.status(200).json(data);
});

router.patch('/:itemType/:id', authMiddleware, async (req, res) => {
    const { itemType, id } = req.params;
    const { name } = req.body;
    const user = (req as any).user;

    if (!name) {
        return res.status(400).json({ error: 'New name is required.' });
    }

    const tableName = itemType === 'file' ? 'files' : 'folders';

    const { data, error } = await supabase
        .from(tableName)
        .update({ name })
        .eq('id', id)
        .eq('owner_id', user.id)
        .select()
        .single();

    if (error) {
        return res.status(500).json({ error: `Failed to rename ${itemType}: ${error.message}` });
    }

    res.status(200).json(data);
});

// SOFT DELETE (MOVE TO TRASH) A FILE OR FOLDER
router.post('/:itemType/:id/trash', authMiddleware, async (req, res) => {
    const { itemType, id } = req.params;
    const user = (req as any).user;

    try {
        // Call the new database function
        const { error } = await supabase.rpc('move_to_trash', {
            p_item_id: id,
            p_item_type: itemType,
            p_user_id: user.id
        });

        if (error) {
            throw error;
        }

        res.status(200).json({ message: `${itemType} and its contents moved to trash.` });
    } catch (error) {
        console.error("Error moving to trash:", error);
        res.status(500).json({ error: `Failed to move ${itemType} to trash: ${"error"}` });
    }
});



// PERMANENTLY DELETE A FILE (AND FROM STORAGE)
// Add this route to your src/files.ts file

// PERMANENTLY DELETE A FOLDER (AND ITS CONTENTS)
router.delete('/:itemType/:id/permanent', authMiddleware, async (req, res) => {
    const { itemType, id } = req.params;
    const user = (req as any).user;

    try {
        if (itemType === 'file') {
            // Logic to delete a single file
            const { data: fileData, error: getError } = await supabase
                .from('files')
                .select('storage_path')
                .eq('id', id)
                .eq('owner_id', user.id)
                .single();

            if (getError || !fileData) throw new Error('File not found.');

            await supabase.storage.from('files').remove([fileData.storage_path]);
            await supabase.from('files').delete().eq('id', id);

            res.status(200).json({ message: 'File permanently deleted.' });

        } else if (itemType === 'folder') {
            // Logic to delete a folder and its contents
            const { data: filesInFolder, error: findFilesError } = await supabase
                .from('files')
                .select('id, storage_path')
                .eq('owner_id', user.id)
                .eq('folder_id', id);

            if (findFilesError) throw findFilesError;

            if (filesInFolder && filesInFolder.length > 0) {
                const filePaths = filesInFolder.map(file => file.storage_path);
                await supabase.storage.from('files').remove(filePaths);

                const fileIds = filesInFolder.map(file => file.id);
                await supabase.from('files').delete().in('id', fileIds);
            }

            await supabase.from('folders').delete().eq('id', id).eq('owner_id', user.id);

            res.status(200).json({ message: 'Folder and contents permanently deleted.' });
        } else {
            return res.status(400).json({ error: 'Invalid item type.' });
        }
    } catch (error) {
        console.error("Permanent delete error:", error);
        res.status(500).json("error occur");
    }
});

router.get('/trash', authMiddleware, async (req, res) => {
    const user = (req as any).user;

    try {
        // 1. Get all trashed folders for the user
        const { data: trashedFolders, error: foldersError } = await supabase
            .from('folders')
            .select('id, name, created_at, owner_id, parent_folder_id, deleted_at')
            .eq('owner_id', user.id)
            .not('deleted_at', 'is', null);

        if (foldersError) throw foldersError;

        // 2. Get all trashed files for the user
        const { data: trashedFiles, error: filesError } = await supabase
            .from('files')
            .select('*')
            .eq('owner_id', user.id)
            .not('deleted_at', 'is', null);

        if (filesError) throw filesError;

        // 3. Filter to find only the "top-level" trashed items
        const trashedFolderIds = new Set(trashedFolders.map(f => f.id));

        const topLevelFolders = trashedFolders.filter(
            folder => !folder.parent_folder_id || !trashedFolderIds.has(folder.parent_folder_id)
        );

        const topLevelFiles = trashedFiles.filter(
            file => !file.folder_id || !trashedFolderIds.has(file.folder_id)
        );

        // 4. Combine and return the results
        const contents = [
            ...topLevelFolders.map(f => ({ ...f, type: 'folder' })),
            ...topLevelFiles.map(f => ({ ...f, type: 'file' }))
        ];
        
        res.status(200).json(contents);

    } catch (error) {
        console.error("Error fetching trash:", error);
        res.status(500).json("error occur");
    }
});

router.post('/:itemType/:id/restore', authMiddleware, async (req, res) => {
    const { itemType, id } = req.params;
    const user = (req as any).user;

    try {
        // Call the new database function
        const { error } = await supabase.rpc('restore_from_trash', {
            p_item_id: id,
            p_item_type: itemType,
            p_user_id: user.id
        });

        if (error) {
            throw error;
        }

        res.status(200).json({ message: `${itemType} and its contents restored.` });
    } catch (error) {
        console.error("Error restoring from trash:", error);
        res.status(500).json({ error: `Failed to restore ${itemType}: "error"` });
    }
});

// REPLACE your old '/:fileId/share' route with this new one


router.post('/share', authMiddleware, async (req, res) => {
    const { itemId, itemType, email, role } = req.body;
    const owner = (req as any).user;

    if (!itemId || !itemType || !email || !role) {
        return res.status(400).json({ error: 'Item ID, type, email, and role are required.' });
    }

    try {
        // 1. Verify ownership (This is a critical security step)
        const tableName = itemType === 'file' ? 'files' : 'folders';
        const { data: itemData, error: ownerError } = await supabase
            .from(tableName)
            .select('id')
            .eq('id', itemId)
            .eq('owner_id', owner.id)
            .single();

        if (ownerError || !itemData) {
            return res.status(403).json({ error: `Forbidden: You are not the owner of this ${itemType}.` });
        }

        // 2. Find the user to share with (using your working method)
        const { data: allUsers, error: userError } = await supabase.auth.admin.listUsers();
        if (userError) throw userError;

        const sharedUser = allUsers.users.find(u => u.email === email);
        if (!sharedUser) {
            return res.status(404).json({ error: 'User with that email not found.' });
        }

        // 3. Create the permission record
        const permissionData = {
            user_id: sharedUser.id,
            role: role,
            file_id: itemType === 'file' ? itemId : null,
            folder_id: itemType === 'folder' ? itemId : null,
        };
        const { error: permissionError } = await supabase.from('permissions').insert(permissionData);

        if (permissionError) {
            return res.status(409).json({ error: 'Could not share item. The user may already have permission.' });
        }

        res.status(200).json({ message: `${itemType.charAt(0).toUpperCase() + itemType.slice(1)} shared successfully with ${email}.` });

    } catch (error) {
        console.error("Error in /share route:", error);
        res.status(500).json({ error: 'An unexpected error occurred.' });
    }
});

// CREATE A PUBLIC, SHAREABLE LINK
router.get('/:fileId/public-link', authMiddleware, async (req, res) => {
    const { fileId } = req.params;
    const user = (req as any).user;

    // 1. Get the file's storage path to ensure ownership
    const { data: fileData, error: getError } = await supabase
        .from('files')
        .select('storage_path')
        .eq('id', fileId)
        .eq('owner_id', user.id)
        .single();

    if (getError || !fileData) {
        return res.status(404).json({ error: 'File not found or you do not have permission.' });
    }

    // 2. Generate a long-lived signed URL (e.g., valid for 1 year)
    const { data, error } = await supabase.storage
        .from('files')
        .createSignedUrl(fileData.storage_path, 31536000); // 1 year in seconds

    if (error) {
        return res.status(500).json({ error: error.message });
    }

    res.status(200).json({ publicUrl: data.signedUrl });
});


router.get('/shared-with-me', authMiddleware, async (req, res) => {
    const user = (req as any).user;

    try {
        // 1. Get all permission records for the current user
        const { data: permissions, error: permissionError } = await supabase
            .from('permissions')
            .select('file_id, folder_id, role')
            .eq('user_id', user.id);

        if (permissionError) throw permissionError;

        // 2. Separate the IDs for files and folders
        const fileIds = permissions
            .filter(p => p.file_id)
            .map(p => p.file_id);
        
        const folderIds = permissions
            .filter(p => p.folder_id)
            .map(p => p.folder_id);

        let sharedFiles = [];
        let sharedFolders = [];

        // 3. Fetch the actual file records if there are any shared files
        if (fileIds.length > 0) {
            const { data, error } = await supabase
                .from('files')
                .select('*')
                .in('id', fileIds);
            if (error) throw error;
            sharedFiles = data.map(file => ({ ...file, type: 'file' }));
        }

        // 4. Fetch the actual folder records if there are any shared folders
        if (folderIds.length > 0) {
            const { data, error } = await supabase
                .from('folders')
                .select('*')
                .in('id', folderIds);
            if (error) throw error;
            // This is the fix: ensure folders have a file_type property for the frontend
            sharedFolders = data.map(folder => ({ ...folder, type: 'folder', file_type: 'folder' }));
        }

        // 5. Combine and return the results
        const allSharedItems = [...sharedFiles, ...sharedFolders];
        res.status(200).json(allSharedItems);

    } catch (error) {
        console.error("Error in /shared-with-me route:", error);
        res.status(500).json("error");
    }
});

// Add this new route to your src/files.ts file

router.get('/search', authMiddleware, async (req, res) => {
    const user = (req as any).user;
    const query = req.query.q as string;

    if (!query) {
        return res.status(400).json({ error: 'Search query is required.' });
    }

    try {
        // Search for folders matching the query
        const { data: folders, error: foldersError } = await supabase
            .from('folders')
            .select('*')
            .eq('owner_id', user.id)
            .is('deleted_at', null)
            .ilike('name', `%${query}%`); // Case-insensitive search

        if (foldersError) throw foldersError;

        // Search for files matching the query
        const { data: files, error: filesError } = await supabase
            .from('files')
            .select('*')
            .eq('owner_id', user.id)
            .is('deleted_at', null)
            .ilike('name', `%${query}%`);

        if (filesError) throw filesError;

        const results = [
            ...folders.map(f => ({ ...f, type: 'folder' })),
            ...files.map(f => ({ ...f, type: 'file' }))
        ];

        res.status(200).json(results);

    } catch (error) {
        res.status(500).json("error occur");
    }
});


export default router;