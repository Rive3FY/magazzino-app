import { redirect } from "next/navigation";

export default function ReferentiRedirect() {
  redirect("/admin?tab=referenti");
}
