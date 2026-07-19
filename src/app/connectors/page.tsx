import { redirect } from "next/navigation";

export default function ConnectorsPage() {
  redirect("/settings?tab=connectors");
}
