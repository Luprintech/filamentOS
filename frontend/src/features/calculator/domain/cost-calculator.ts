export interface OtherCostItem {
  price?: number;
}

export interface FilamentRowCalcInput {
  grams: number;
  spoolPrice: number;
  spoolWeight: number;
}

export interface CostCalculatorInput {
  printingTimeHours: number;
  printingTimeMinutes: number;
  // Legacy single-filament fields
  filamentWeight: number;
  spoolWeight: number;
  spoolPrice: number;
  // Multi-filament array (takes precedence when non-empty)
  filaments?: FilamentRowCalcInput[];
  powerConsumptionWatts: number;
  energyCostKwh: number;
  prepTime: number;
  prepCostPerHour: number;
  postProcessingTimeInMinutes: number;
  postProcessingCostPerHour: number;
  includeMachineCosts: boolean;
  printerCost: number;
  investmentReturnYears: number;
  repairCost: number;
  otherCosts: OtherCostItem[];
  profitPercentage: number;
  vatPercentage: number;
}

export interface CostCalculations {
  filamentCost: number;
  electricityCost: number;
  laborCost: number;
  currentMachineCost: number;
  otherCostsTotal: number;
  subTotal: number;
  profitAmount: number;
  priceBeforeVat: number;
  vatAmount: number;
  finalPrice: number;
}

export function calculateCostBreakdown(input: CostCalculatorInput): CostCalculations {
  const totalPrintingTimeHours = input.printingTimeHours + input.printingTimeMinutes / 60;

  let amortizationForJob = 0;
  if (input.includeMachineCosts && input.investmentReturnYears > 0 && input.printerCost > 0) {
    const machineHourlyRate = input.printerCost / (input.investmentReturnYears * 365 * 8);
    amortizationForJob = machineHourlyRate * totalPrintingTimeHours;
  }

  const electricityCost =
    totalPrintingTimeHours > 0 && input.powerConsumptionWatts > 0 && input.energyCostKwh > 0
      ? (input.powerConsumptionWatts / 1000) * totalPrintingTimeHours * input.energyCostKwh
      : 0;

  const filamentCost =
    input.filaments && input.filaments.length > 0
      ? input.filaments.reduce(
          (sum, f) => sum + (f.spoolWeight > 0 ? (f.grams / f.spoolWeight) * f.spoolPrice : 0),
          0,
        )
      : input.spoolWeight > 0
        ? (input.filamentWeight / input.spoolWeight) * input.spoolPrice
        : 0;
  const prepCost = (input.prepTime / 60) * input.prepCostPerHour;
  const totalPostProcessingTimeHours = input.postProcessingTimeInMinutes / 60;
  const postProcessingCost = totalPostProcessingTimeHours * input.postProcessingCostPerHour;
  const laborCost = prepCost + postProcessingCost;
  const currentMachineCost = input.includeMachineCosts ? amortizationForJob + input.repairCost : 0;
  const otherCostsTotal = input.otherCosts.reduce((acc, cost) => acc + Number(cost.price || 0), 0);

  const subTotal = filamentCost + electricityCost + laborCost + currentMachineCost + otherCostsTotal;
  const profitAmount = subTotal * (input.profitPercentage / 100);
  const priceBeforeVat = subTotal + profitAmount;
  const vatAmount = priceBeforeVat * (input.vatPercentage / 100);
  const finalPrice = priceBeforeVat + vatAmount;

  return {
    filamentCost,
    electricityCost,
    laborCost,
    currentMachineCost,
    otherCostsTotal,
    subTotal,
    profitAmount,
    priceBeforeVat,
    vatAmount,
    finalPrice,
  };
}
