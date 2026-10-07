"use client";

import { useState } from "react";
import { Calculator as CalculatorIcon, Copy, Delete, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { toast } from "sonner";
import { calculatorResult, type CalculatorOperator } from "@/lib/calculator";

/** `inDocument` puts the calculator inside a document editor: it stays open while the form is used, so both work together. */
export function WorkspaceCalculator({ inDocument = false }: { inDocument?: boolean }) {
  const [open, setOpen] = useState(false);
  const [display, setDisplay] = useState("0");
  const [storedValue, setStoredValue] = useState<number | null>(null);
  const [operator, setOperator] = useState<CalculatorOperator | null>(null);
  const [waitingForNumber, setWaitingForNumber] = useState(false);

  const reset = () => {
    setDisplay("0");
    setStoredValue(null);
    setOperator(null);
    setWaitingForNumber(false);
  };
  const enterDigit = (digit: string) => {
    if (display === "Error" || waitingForNumber) {
      setDisplay(digit);
      setWaitingForNumber(false);
    } else if (display.length < 15) setDisplay(display === "0" ? digit : `${display}${digit}`);
  };
  const enterDecimal = () => {
    if (display === "Error" || waitingForNumber) {
      setDisplay("0.");
      setWaitingForNumber(false);
    } else if (!display.includes(".") && display.length < 15) setDisplay(`${display}.`);
  };
  const selectOperator = (nextOperator: CalculatorOperator) => {
    const current = Number(display);
    if (!Number.isFinite(current)) return reset();
    if (storedValue !== null && operator && !waitingForNumber) {
      const result = calculatorResult(storedValue, current, operator);
      if (result === null) {
        setDisplay("Error");
        setStoredValue(null);
        setOperator(null);
        setWaitingForNumber(true);
        return;
      }
      setDisplay(String(result));
      setStoredValue(result);
    } else setStoredValue(current);
    setOperator(nextOperator);
    setWaitingForNumber(true);
  };
  const equals = () => {
    if (storedValue === null || !operator || waitingForNumber) return;
    const result = calculatorResult(storedValue, Number(display), operator);
    setDisplay(result === null ? "Error" : String(result));
    setStoredValue(null);
    setOperator(null);
    setWaitingForNumber(true);
  };
  const backspace = () => {
    if (display === "Error" || waitingForNumber) return reset();
    setDisplay(display.length > 1 ? display.slice(0, -1) : "0");
  };
  const toggleSign = () => {
    if (display !== "0" && display !== "Error") setDisplay(display.startsWith("-") ? display.slice(1) : `-${display}`);
  };
  const percent = () => {
    const value = Number(display);
    if (Number.isFinite(value)) setDisplay(String(Number((value / 100).toPrecision(12))));
  };

  const copyResult = async () => {
    if (display === "Error") return;
    try { await navigator.clipboard.writeText(display); toast.success(`${display} copied. Paste it into the field you need.`); }
    catch { toast.error("Could not copy. Select the number and copy it instead."); }
  };

  return <Popover open={open} onOpenChange={setOpen} modal={false}>
    <PopoverTrigger asChild>
      {inDocument
        ? <Button type="button" variant="outline" size="sm" aria-label="Calculator" title="Calculator"><CalculatorIcon className="size-4" />Calculator</Button>
        : <Button type="button" variant="ghost" size="icon" aria-label="Calculator" title="Calculator"><CalculatorIcon className="size-4" /></Button>}
    </PopoverTrigger>
    <PopoverContent align="end" className="w-72 max-w-[calc(100vw-2rem)] space-y-3 p-3"
      onInteractOutside={inDocument ? (event) => event.preventDefault() : undefined}
      onFocusOutside={inDocument ? (event) => event.preventDefault() : undefined}
      onOpenAutoFocus={inDocument ? (event) => event.preventDefault() : undefined}>
      <div className="flex items-center justify-between gap-2"><div><p className="font-semibold">Calculator</p><p className="text-xs text-muted-foreground">{inDocument ? "Stays open while you fill in the document" : "Quick calculations"}</p></div>
        <div className="flex items-center gap-1"><Button type="button" variant="ghost" size="icon" className="size-8" aria-label="Copy result" title="Copy result" disabled={display === "Error"} onClick={() => void copyResult()}><Copy className="size-4" /></Button>{inDocument ? <Button type="button" variant="ghost" size="icon" className="size-8" aria-label="Close calculator" title="Close calculator" onClick={() => setOpen(false)}><X className="size-4" /></Button> : <CalculatorIcon className="size-5 text-primary" />}</div></div>
      <div aria-live="polite" aria-label="Calculator display" className="min-h-16 overflow-hidden rounded-lg border bg-muted/45 px-3 py-2 text-right">
        <p className="h-4 text-xs text-muted-foreground">{storedValue !== null && operator ? `${storedValue} ${operator}` : "\u00a0"}</p>
        <p className="truncate text-2xl font-semibold tabular-nums">{display}</p>
      </div>
      <div className="grid grid-cols-4 gap-2">
        <Button type="button" variant="secondary" onClick={reset}>AC</Button>
        <Button type="button" variant="secondary" onClick={toggleSign}>±</Button>
        <Button type="button" variant="secondary" onClick={percent}>%</Button>
        <Button type="button" variant={operator === "÷" ? "default" : "secondary"} aria-pressed={operator === "÷"} onClick={() => selectOperator("÷")}>÷</Button>
        {["7", "8", "9"].map((digit) => <Button key={digit} type="button" variant="outline" onClick={() => enterDigit(digit)}>{digit}</Button>)}
        <Button type="button" variant={operator === "×" ? "default" : "secondary"} aria-pressed={operator === "×"} onClick={() => selectOperator("×")}>×</Button>
        {["4", "5", "6"].map((digit) => <Button key={digit} type="button" variant="outline" onClick={() => enterDigit(digit)}>{digit}</Button>)}
        <Button type="button" variant={operator === "−" ? "default" : "secondary"} aria-pressed={operator === "−"} onClick={() => selectOperator("−")}>−</Button>
        {["1", "2", "3"].map((digit) => <Button key={digit} type="button" variant="outline" onClick={() => enterDigit(digit)}>{digit}</Button>)}
        <Button type="button" variant={operator === "+" ? "default" : "secondary"} aria-pressed={operator === "+"} onClick={() => selectOperator("+")}>+</Button>
        <Button type="button" variant="secondary" aria-label="Backspace" onClick={backspace}><Delete className="size-4" /></Button>
        <Button type="button" variant="outline" onClick={() => enterDigit("0")}>0</Button>
        <Button type="button" variant="outline" onClick={enterDecimal}>.</Button>
        <Button type="button" onClick={equals}>=</Button>
      </div>
    </PopoverContent>
  </Popover>;
}
