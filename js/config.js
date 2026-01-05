// js/config.js

import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

// Use the SAME Supabase project as getturntbl.com
const SUPABASE_URL = 'https://uwdyaemtrlsjruedxhpf.supabase.co'; // Same as getturntbl.com
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV3ZHlhZW10cmxzanJ1ZWR4aHBmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjYyNzc4MDEsImV4cCI6MjA4MTg1MzgwMX0.JxNodaJLV6ryrFPfPdj-97qQ2c-GjlqAabvwrCk0aOE'; // Same as getturntbl.com

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Edge function URL
export const UPLOAD_FUNCTION_URL = `${SUPABASE_URL}/functions/v1/upload-song-video`;
