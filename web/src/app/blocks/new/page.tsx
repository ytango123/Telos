import { redirect } from "next/navigation";

export default function NewBlockRedirect() {
  redirect("/blocks?new=1");
}
