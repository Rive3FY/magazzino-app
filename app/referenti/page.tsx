import { redirect } from "next/navigation";

export default function ReferentiRedirect() {
  redirect("/materiali/admin?tab=referenti");
}
