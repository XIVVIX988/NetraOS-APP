// This is a Supabase publishable key. It is meant to be visible in browser code.
// Keep secret/service-role keys out of this file and out of the static website.
if (window.supabase?.createClient) {
  window.netraosSupabaseClient = window.supabase.createClient(
    "https://nqacreyemzoiarnaaska.supabase.co",
    "sb_publishable_FvezqJiBWBRFPqzHpBZI8w_OQj3tCpZ"
  );
} else {
  window.netraosSupabaseClient = null;
}
