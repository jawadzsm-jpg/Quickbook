"use client";

import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type Rep = { id: number; name: string };

export function PaymentSalesRep({ employees, value, onChange }: { employees: Rep[]; value: string; onChange: (name: string) => void }) {
  const reps = employees;
  return <div className="space-y-2"><Label htmlFor="payment-sales-rep">Sales Rep</Label>
    <Select value={value || "none"} onValueChange={(selected) => onChange(selected === "none" ? "" : selected)}><SelectTrigger id="payment-sales-rep" className="w-full"><SelectValue placeholder="Select sales rep" /></SelectTrigger><SelectContent><SelectItem value="none">No sales rep</SelectItem>{value && !reps.some((rep) => rep.name === value) && <SelectItem value={value}>{value}</SelectItem>}{reps.map((rep) => <SelectItem key={rep.id} value={rep.name}>{rep.name}</SelectItem>)}</SelectContent></Select>
  </div>;
}
