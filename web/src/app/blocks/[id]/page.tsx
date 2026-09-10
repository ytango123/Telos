import { redirect } from "next/navigation";

export default async function EditBlockRedirect({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/blocks?edit=${id}`);
}
