import { supabase } from './supabaseClient.js';

export const authMiddleware = async (req: any, res: any, next: any) => {
  // The token is expected in the Authorization header, e.g., "Bearer <token>"
  const token = req.headers.authorization?.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Authentication required. No token provided.' });
  }

  // Ask Supabase to verify the token
  const { data: { user }, error } = await supabase.auth.getUser(token);

  if (error || !user) {
    return res.status(401).json({ error: 'Invalid or expired token.' });
  }
  
  // Attach the verified user object to the request
  req.user = user;
  
  // Proceed to the next middleware or the actual route handler
  next();
};
