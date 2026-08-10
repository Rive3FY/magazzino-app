import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { deriveAdminAccess } from "./app/_lib/admin-access";

export async function middleware(request: NextRequest) {
  const response = NextResponse.next();

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, options);
          });
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;

  // Pagine pubbliche (accessibili senza login)
  const isPublic =
    path === "/login" ||
    path === "/privacy" ||
    path === "/logout" ||
    path === "/preview-restyling" ||
    path === "/scarica-app" ||
    path.startsWith("/downloads/") ||
    path === "/app-version.json" ||
    path.startsWith("/auth/") ||
    path.startsWith("/_next") ||
    path.startsWith("/favicon.ico");

  if (!user && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  // Utente loggato ma non approvato: solo /pending, /logout, /login/aggiorna-password
  if (user && !isPublic && path !== "/pending" && path !== "/login/aggiorna-password") {
    let access = deriveAdminAccess(null);
    try {
      const { data: profile, error } = await supabase
        .from("profiles")
        .select("approved,is_admin,is_super_admin,is_materials_admin,is_equipment_linee_admin,is_equipment_stazioni_admin")
        .eq("id", user.id)
        .maybeSingle();

      if (error) throw error;

      access = deriveAdminAccess({
        approved: !!profile?.approved,
        legacyAdmin: !!profile?.is_admin,
        isSuperAdmin: !!profile?.is_super_admin || !!profile?.is_admin,
        isMaterialsAdmin: !!profile?.is_materials_admin,
        isEquipmentLineeAdmin: !!profile?.is_equipment_linee_admin,
        isEquipmentStazioniAdmin: !!profile?.is_equipment_stazioni_admin,
      });
    } catch {
      try {
        const { data: legacyProfile, error: legacyError } = await supabase
          .from("profiles")
          .select("approved,is_admin")
          .eq("id", user.id)
          .maybeSingle();

        if (legacyError) throw legacyError;

        access = deriveAdminAccess({
          approved: !!legacyProfile?.approved,
          legacyAdmin: !!legacyProfile?.is_admin,
          isSuperAdmin: !!legacyProfile?.is_admin,
        });
      } catch {}
    }

    if (!access.approved && !access.isAdmin) {
      const url = request.nextUrl.clone();
      url.pathname = "/pending";
      return NextResponse.redirect(url);
    }
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};