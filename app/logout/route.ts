import { NextResponse } from "next/server";
import { createClient } from "../_lib/supabase/server";

export async function GET(request: Request) {
  const supabase = await createClient();
  await supabase.auth.signOut();

  const url = new URL(request.url);
  url.pathname = "/login";
  url.search = "";
  url.hash = "";
  return NextResponse.redirect(url);
}