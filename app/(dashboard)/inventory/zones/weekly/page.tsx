import { redirect } from 'next/navigation';

/** Canonical Zone Inventory page is /inventory/zones (single page with Weekly + Assignments tabs). */
export default function InventoryWeeklyPage() {
  redirect('/inventory/zones');
}
