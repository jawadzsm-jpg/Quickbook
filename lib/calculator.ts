export type CalculatorOperator = "+" | "−" | "×" | "÷";

export function calculatorResult(left: number, right: number, operator: CalculatorOperator) {
  if (operator === "÷" && right === 0) return null;
  const result = operator === "+" ? left + right
    : operator === "−" ? left - right
      : operator === "×" ? left * right
        : left / right;
  return Number.isFinite(result) ? Number(result.toPrecision(12)) : null;
}
