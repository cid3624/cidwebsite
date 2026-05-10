/**
 * Remplace les valeurs par celles du projet Supabase :
 * Dashboard → Settings → API → Project URL & anon public key.
 */
window.APP_CONFIG = {
  supabaseUrl: "https://romdsaltesvejmuvllsf.supabase.co",
  /** Clé publique (publishable / anon) — même valeur que NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY dans .env.local */
  supabaseAnonKey: "sb_publishable_nVSVBa6U2NtIXbH0hcaPUw_dpVPcHvK",
  /** Nombre de lignes par chargement infinite scroll */
  pageSize: 12
};
