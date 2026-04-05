
import React, { useState, useRef } from "react";
import { useFieldArray, type UseFormReturn } from "react-hook-form";
import { formSchema, type FormData } from "@/lib/schema";
import { defaultFormValues } from "@/lib/defaults";

import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardTitle,
} from "@/components/ui/card";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { saveProject } from "@/lib/projects";
import { useAuth } from "@/context/auth-context";
import { PrintSummary } from "@/components/print-summary";
import {
  UploadCloud,
  Loader2,
  Trash2,
  PlusCircle,
  Printer,
  Share2,
  FileText,
  Clock,
  Weight,
  Palette,
  DollarSign,
  Wrench,
  Zap,
  ImagePlus,
  Save,
  FilePlus,
} from "lucide-react";
import { TooltipProvider } from "./ui/tooltip";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";

export function CalculatorForm({ form, onProjectSaved }: { form: UseFormReturn<FormData>; onProjectSaved?: () => void }) {
  const { toast } = useToast();
  const { user, loginWithGoogle } = useAuth();
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "otherCosts",
  });


  const watchedValues = form.watch();

  const printingTimeHours = Number(watchedValues.printingTimeHours || 0);
  const printingTimeMinutes = Number(watchedValues.printingTimeMinutes || 0);
  const filamentWeight = Number(watchedValues.filamentWeight || 0);
  const spoolWeight = Number(watchedValues.spoolWeight || 1000);
  const spoolPrice = Number(watchedValues.spoolPrice || 0);
  const powerConsumptionWatts = Number(watchedValues.powerConsumptionWatts || 0);
  const energyCostKwh = Number(watchedValues.energyCostKwh || 0);
  const prepTime = Number(watchedValues.prepTime || 0);
  const prepCostPerHour = Number(watchedValues.prepCostPerHour || 0);
  const postProcessingTimeInMinutes = Number(watchedValues.postProcessingTimeInMinutes || 0);
  const postProcessingCostPerHour = Number(watchedValues.postProcessingCostPerHour || 0);
  const printerCost = Number(watchedValues.printerCost || 0);
  const investmentReturnYears = Number(watchedValues.investmentReturnYears || 0);
  const repairCost = Number(watchedValues.repairCost || 0);
  const otherCosts = watchedValues.otherCosts || [];
  const profitPercentage = Number(watchedValues.profitPercentage || 0);
  const vatPercentage = Number(watchedValues.vatPercentage || 0);

  const totalPrintingTimeHours = printingTimeHours + (printingTimeMinutes / 60);

  let amortizationForJob = 0;
  if (watchedValues.includeMachineCosts && investmentReturnYears > 0 && printerCost > 0) {
    const machineHourlyRate = printerCost / (investmentReturnYears * 365 * 8);
    amortizationForJob = machineHourlyRate * totalPrintingTimeHours;
  }
  
  const electricityCost = totalPrintingTimeHours > 0 && powerConsumptionWatts > 0 && energyCostKwh > 0
    ? (powerConsumptionWatts / 1000) * totalPrintingTimeHours * energyCostKwh
    : 0;
  const filamentCost = spoolWeight > 0 ? (filamentWeight / spoolWeight) * spoolPrice : 0;
  const prepCost = (prepTime / 60) * prepCostPerHour;
  const totalPostProcessingTimeHours = postProcessingTimeInMinutes / 60;
  const postProcessingCost = totalPostProcessingTimeHours * postProcessingCostPerHour;
  const laborCost = prepCost + postProcessingCost;
  const currentMachineCost = watchedValues.includeMachineCosts ? (amortizationForJob + repairCost) : 0;
  const otherCostsTotal = otherCosts.reduce((acc, cost) => acc + Number(cost.price || 0), 0);

  const subTotal = filamentCost + electricityCost + laborCost + currentMachineCost + otherCostsTotal;
  const profitAmount = subTotal * (profitPercentage / 100);
  const priceBeforeVat = subTotal + profitAmount;
  const vatAmount = priceBeforeVat * (vatPercentage / 100);
  const finalPrice = priceBeforeVat + vatAmount;

  const calculations = {
    filamentCost, electricityCost, laborCost, currentMachineCost, otherCostsTotal, subTotal,
    profitAmount, priceBeforeVat, vatAmount, finalPrice,
  };

  const handleNewProject = () => {
    form.reset(defaultFormValues);
    toast({ title: "Nuevo proyecto", description: "El formulario ha sido limpiado." });
  }

  const handleSaveProject = async () => {
    if (!user) {
      loginWithGoogle();
      return;
    }
    setIsSaving(true);
    try {
      const isValid = await form.trigger();
      if (!isValid) {
        toast({
          variant: "destructive",
          title: "Faltan campos obligatorios",
          description: "Por favor, completa todos los campos marcados con *.",
        });
        return;
      }

      const formData = form.getValues();
      const dataToSave = JSON.parse(JSON.stringify(formData));
      if (dataToSave.id) delete dataToSave.id;

      const result = await saveProject(user.id, dataToSave);
      if (result.error) {
        toast({ variant: "destructive", title: "Error al guardar", description: result.error });
      } else {
        toast({ title: "¡Guardado correctamente!" });
        form.reset(defaultFormValues);
        onProjectSaved?.();
      }
    } catch (err) {
      console.error("Error inesperado al guardar el proyecto:", err);
      toast({ variant: "destructive", title: "Ha ocurrido un error inesperado." });
    } finally {
      setIsSaving(false);
    }
  };


  const handleGcodeAnalyze = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsAnalyzing(true);
    try {
      const fd = new FormData();
      fd.append('gcodeFile', file);

      const response = await fetch('/api/analyze-gcode', {
        method: 'POST',
        body: fd,
      });
      const result = await response.json() as {
        data?: { printingTimeSeconds: number | null; filamentWeightGrams: number | null };
        error?: string;
      };

      if (result.error) {
        toast({ variant: "destructive", title: "Análisis fallido", description: result.error });
      } else if (result.data) {
        const updated: string[] = [];
        const missing: string[] = [];

        if (result.data.printingTimeSeconds !== null && result.data.printingTimeSeconds > 0) {
          const totalMinutes = Math.round(result.data.printingTimeSeconds / 60);
          // Poner ambos campos antes de validar para que el refine (hours>0 || min>0) pase correctamente
          form.setValue('printingTimeHours', Math.floor(totalMinutes / 60), { shouldValidate: false });
          form.setValue('printingTimeMinutes', totalMinutes % 60, { shouldValidate: false });
          form.trigger(['printingTimeHours', 'printingTimeMinutes']);
          updated.push('tiempo de impresión');
        } else {
          missing.push('tiempo de impresión');
        }

        if (result.data.filamentWeightGrams !== null && result.data.filamentWeightGrams > 0) {
          form.setValue('filamentWeight', parseFloat(result.data.filamentWeightGrams.toFixed(2)), { shouldValidate: true });
          updated.push('peso del filamento');
        } else {
          missing.push('peso del filamento');
        }

        if (updated.length > 0 && missing.length === 0) {
          toast({ title: "Análisis completado", description: `${updated.join(' y ')} actualizados.` });
        } else if (updated.length > 0) {
          toast({
            title: "Análisis parcial",
            description: `Actualizado: ${updated.join(', ')}. No encontrado: ${missing.join(', ')} — introdúcelo manualmente.`,
          });
        } else {
          toast({ variant: "destructive", title: "Sin datos", description: "No se encontraron valores en el archivo. Introdúcelos manualmente." });
        }
      }
    } catch {
      toast({ variant: "destructive", title: "Error de conexión con el servidor." });
    } finally {
      setIsAnalyzing(false);
      if (event.target) event.target.value = '';
    }
  };
  
  const handleImageUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const MAX_IMAGE_SIZE_KB = 500;
    if (file.size > MAX_IMAGE_SIZE_KB * 1024) {
      toast({
        variant: "destructive",
        title: "Imagen demasiado grande",
        description: `La imagen no puede superar los ${MAX_IMAGE_SIZE_KB} KB.`,
      });
      if(event.target) event.target.value = ''; // Clear the input
      return;
    }

    const reader = new FileReader();
    reader.onloadend = () => {
      form.setValue('projectImage', reader.result as string, { shouldValidate: true });
    };
    reader.readAsDataURL(file);
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('es-ES', {
      style: 'currency',
      currency: watchedValues.currency || 'EUR',
      minimumFractionDigits: 2,
    }).format(amount);
  };

  const handlePrint = () => {
    setTimeout(() => {
      window.print();
    }, 100);
  };

  const handleShare = async () => {
    let summaryText = `
    Trabajo de Impresión 3D: ${watchedValues.jobName || 'Sin título'}
    ---
    Coste de Filamento: ${formatCurrency(calculations.filamentCost)}
    Coste de Electricidad: ${formatCurrency(calculations.electricityCost)}
    Coste de Mano de Obra: ${formatCurrency(calculations.laborCost)}
    `;

    if(watchedValues.includeMachineCosts) {
      summaryText += `
Coste de Máquina: ${formatCurrency(calculations.currentMachineCost)}`;
    }

    summaryText += `
    Otros Costes: ${formatCurrency(calculations.otherCostsTotal)}
    ---
    Sub-total: ${formatCurrency(calculations.subTotal)}
    Beneficio (${watchedValues.profitPercentage}%): ${formatCurrency(calculations.profitAmount)}
    IVA (${watchedValues.vatPercentage}%): ${formatCurrency(calculations.vatAmount)}
    ---
    Precio Final: ${formatCurrency(calculations.finalPrice)}
    `;

    if (navigator.share) {
      try {
        await navigator.share({
          title: 'Resumen de Coste de Impresión 3D',
          text: summaryText.trim(),
        });
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') {
            return;
        }
        await navigator.clipboard.writeText(summaryText.trim());
        toast({ title: 'Resumen copiado al portapapeles.' });
      }
    } else {
        await navigator.clipboard.writeText(summaryText.trim());
        toast({ title: 'Resumen copiado al portapapeles.' });
    }
  };


  return (
    <TooltipProvider>
      <Form {...form}>
        <div className="space-y-4 print:hidden">
          <Accordion 
            type="multiple" 
            className="w-full space-y-4"
            defaultValue={['job-details', 'filament-costs', 'electricity-costs', 'labor-costs', 'final-price']}
          >
            <Card>
              <AccordionItem value="job-details" className="border-b-0">
                <AccordionTrigger className="p-6 hover:no-underline">
                  <div className="text-left">
                    <CardTitle className="font-headline text-2xl flex items-center gap-2"><FileText className="text-primary"/> Detalles del Trabajo</CardTitle>
                    <CardDescription>Comienza definiendo tu trabajo y subiendo tu G-code para un análisis automático.</CardDescription>
                  </div>
                </AccordionTrigger>
                <AccordionContent className="p-6 pt-0">
                  <div className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                       <FormField control={form.control} name="jobName" render={({ field }) => (
                        <FormItem>
                          <FormLabel>Nombre del Trabajo <span className="text-destructive">*</span></FormLabel>
                          <FormControl><Input placeholder="Ej: Benchy, Litofanía, etc." {...field} /></FormControl>
                          <FormMessage />
                        </FormItem>
                      )} />
                      <FormField
                        control={form.control}
                        name="currency"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Moneda</FormLabel>
                            <Select onValueChange={field.onChange} defaultValue={field.value}>
                              <FormControl>
                                <SelectTrigger>
                                  <SelectValue placeholder="Selecciona una moneda" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                <SelectItem value="EUR">Euro (€)</SelectItem>
                                <SelectItem value="USD">Dólar ($)</SelectItem>
                                <SelectItem value="GBP">Libra (£)</SelectItem>
                                <SelectItem value="JPY">Yen (¥)</SelectItem>
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                    <div className="space-y-2">
                      <FormLabel>Imagen del Proyecto (Opcional)</FormLabel>
                       <div className="flex items-center gap-4">
                          <input
                              type="file"
                              accept="image/*"
                              className="hidden"
                              ref={imageInputRef}
                              onChange={handleImageUpload}
                          />
                          <Button type="button" variant="outline" onClick={() => imageInputRef.current?.click()}>
                              <ImagePlus className="mr-2" /> Subir Imagen
                          </Button>
                          {watchedValues.projectImage && (
                              <div className="relative">
                                  <img
                                      src={watchedValues.projectImage}
                                      alt="Vista previa del proyecto"
                                      width={64}
                                      height={64}
                                      className="h-16 w-16 rounded-md object-cover border"
                                  />
                                  <Button
                                      type="button"
                                      variant="destructive"
                                      size="icon"
                                      className="absolute -right-2 -top-2 h-6 w-6 rounded-full"
                                      onClick={() => form.setValue('projectImage', '')}
                                  >
                                      <Trash2 className="h-3 w-3" />
                                  </Button>
                              </div>
                          )}
                      </div>
                       <FormDescription>
                          Añade una imagen para identificar tu proyecto guardado. Máx 500KB.
                      </FormDescription>
                    </div>
                    <Separator />
                    <div>
                      <FormLabel>Análisis de G-code / 3MF</FormLabel>
                      <div className="mt-2">
                        <input type="file" ref={fileInputRef} onChange={handleGcodeAnalyze} accept=".gcode,.3mf" className="hidden" />
                        <Button type="button" variant="outline" onClick={() => fileInputRef.current?.click()} disabled={isAnalyzing}>
                          {isAnalyzing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <UploadCloud className="mr-2 h-4 w-4" />}
                          {isAnalyzing ? 'Analizando...' : 'Subir G-code / 3MF'}
                        </Button>
                        <p className="text-sm text-muted-foreground mt-2">Sube tu archivo <strong>.gcode</strong> o <strong>.3mf</strong> (PrusaSlicer, Bambu Studio, OrcaSlicer) para rellenar automáticamente el tiempo de impresión y el peso del filamento.</p>
                      </div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                          <FormLabel className="flex items-center gap-2"><Clock size={16}/> Tiempo de Impresión <span className="text-destructive">*</span></FormLabel>
                          <div className="flex items-center gap-2">
                              <FormField
                                  control={form.control}
                                  name="printingTimeHours"
                                  render={({ field }) => (
                                      <FormItem className="w-full">
                                          <FormControl>
                                              <div className="relative">
                                                  <Input type="number" placeholder="Horas" className="pr-8" {...field} />
                                                  <span className="absolute inset-y-0 right-0 flex items-center pr-3 text-muted-foreground text-sm pointer-events-none">h</span>
                                              </div>
                                          </FormControl>
                                          <FormMessage />
                                      </FormItem>
                                  )}
                              />
                              <FormField
                                  control={form.control}
                                  name="printingTimeMinutes"
                                  render={({ field }) => (
                                      <FormItem className="w-full">
                                          <FormControl>
                                              <div className="relative">
                                                  <Input type="number" placeholder="Minutos" className="pr-8" {...field} />
                                                  <span className="absolute inset-y-0 right-0 flex items-center pr-3 text-muted-foreground text-sm pointer-events-none">m</span>
                                              </div>
                                          </FormControl>
                                          <FormMessage />
                                      </FormItem>
                                  )}
                              />
                          </div>
                      </div>
                      <FormField control={form.control} name="filamentWeight" render={({ field }) => (
                        <FormItem>
                          <FormLabel className="flex items-center gap-2"><Weight size={16}/> Peso del Filamento (gramos) <span className="text-destructive">*</span></FormLabel>
                          <FormControl><Input type="number" step="0.01" {...field} /></FormControl>
                          <FormMessage />
                        </FormItem>
                      )} />
                    </div>
                  </div>
                </AccordionContent>
              </AccordionItem>
            </Card>

            <Card>
              <AccordionItem value="filament-costs" className="border-b-0">
                <AccordionTrigger className="p-6 hover:no-underline">
                  <div className="text-left">
                    <CardTitle className="font-headline text-2xl flex items-center gap-2"><Palette className="text-primary"/> Costes de Filamento</CardTitle>
                    <CardDescription>Proporciona detalles sobre la bobina de filamento para calcular los costes de material.</CardDescription>
                  </div>
                </AccordionTrigger>
                <AccordionContent className="p-6 pt-0">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <FormField
                      control={form.control}
                      name="filamentType"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Tipo de Filamento <span className="text-destructive">*</span></FormLabel>
                          <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Selecciona un tipo" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="PLA">PLA</SelectItem>
                              <SelectItem value="PETG">PETG</SelectItem>
                              <SelectItem value="ASA">ASA</SelectItem>
                              <SelectItem value="ABS">ABS</SelectItem>
                              <SelectItem value="OTROS">OTROS</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField control={form.control} name="spoolPrice" render={({ field }) => (
                        <FormItem><FormLabel>Precio de la Bobina <span className="text-destructive">*</span></FormLabel><FormControl><Input type="number" step="0.01" {...field} /></FormControl><FormMessage /></FormItem>
                    )} />
                    <FormField control={form.control} name="spoolWeight" render={({ field }) => (
                        <FormItem><FormLabel>Peso de la Bobina (gramos) <span className="text-destructive">*</span></FormLabel><FormControl><Input type="number" {...field} /></FormControl><FormMessage/></FormItem>
                    )} />
                  </div>
                  <Separator className="my-6" />
                  <div className="flex justify-between font-medium text-lg">
                      <span>Coste total de filamento:</span>
                      <span className="text-primary">{formatCurrency(calculations.filamentCost)}</span>
                  </div>
                </AccordionContent>
              </AccordionItem>
            </Card>

            <Card>
              <AccordionItem value="electricity-costs" className="border-b-0">
                <AccordionTrigger className="p-6 hover:no-underline">
                  <div className="text-left">
                    <CardTitle className="font-headline text-2xl flex items-center gap-2"><Zap className="text-primary"/> Electricidad</CardTitle>
                    <CardDescription>Calcula el coste de la electricidad consumida durante la impresión.</CardDescription>
                  </div>
                </AccordionTrigger>
                <AccordionContent className="p-6 pt-0">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FormField control={form.control} name="powerConsumptionWatts" render={({ field }) => (
                        <FormItem>
                          <FormLabel>Consumo de energía (vatios)</FormLabel>
                          <FormControl><Input type="number" placeholder="Ej: 150" {...field} /></FormControl>
                          <FormMessage />
                        </FormItem>
                    )} />
                    <FormField control={form.control} name="energyCostKwh" render={({ field }) => (
                        <FormItem>
                            <FormLabel>Coste de energía por kWh</FormLabel>
                            <FormControl><Input type="number" step="0.01" placeholder="Ej: 0.15" {...field} /></FormControl>
                            <FormDescription>El coste en la moneda seleccionada.</FormDescription>
                            <FormMessage/>
                        </FormItem>
                    )} />
                  </div>
                  <Separator className="my-6" />
                  <div className="flex justify-between font-medium text-lg">
                      <span>Coste total de electricidad:</span>
                      <span className="text-primary">{formatCurrency(calculations.electricityCost)}</span>
                  </div>
                </AccordionContent>
              </AccordionItem>
            </Card>

            <Card>
              <AccordionItem value="labor-costs" className="border-b-0">
                <AccordionTrigger className="p-6 hover:no-underline">
                  <div className="text-left">
                    <CardTitle className="font-headline text-2xl flex items-center gap-2"><Wrench className="text-primary"/> Mano de Obra, Máquina y Otros</CardTitle>
                  </div>
                </AccordionTrigger>
                <AccordionContent className="p-6 pt-0">
                  <div className="space-y-6">
                    <div>
                      <h3 className="font-semibold mb-2">Costes de Mano de Obra</h3>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <FormField control={form.control} name="prepTime" render={({ field }) => (<FormItem><FormLabel>Tiempo de Preparación (min)</FormLabel><FormControl><Input type="number" {...field} /></FormControl></FormItem>)} />
                          <FormField control={form.control} name="prepCostPerHour" render={({ field }) => (<FormItem><FormLabel>Coste de Preparación/hr</FormLabel><FormControl><Input type="number" {...field} /></FormControl></FormItem>)} />
                          
                          <FormField
                              control={form.control}
                              name="postProcessingTimeInMinutes"
                              render={({ field }) => (
                                  <FormItem>
                                      <FormLabel>Tiempo de Post-procesamiento (min)</FormLabel>
                                      <FormControl><Input type="number" {...field} /></FormControl>
                                  </FormItem>
                              )}
                          />

                          <FormField control={form.control} name="postProcessingCostPerHour" render={({ field }) => (<FormItem><FormLabel>Coste de Post-procesamiento/hr</FormLabel><FormControl><Input type="number" {...field} /></FormControl></FormItem>)} />
                      </div>
                      <Separator className="my-6" />
                      <div className="flex justify-between font-medium text-lg">
                          <span>Coste total de mano de obra:</span>
                          <span className="text-primary">{formatCurrency(calculations.laborCost)}</span>
                      </div>
                    </div>
                    <Separator/>
                    <div>
                        <h3 className="font-semibold mb-2">Máquina y Mantenimiento</h3>
                        <FormField control={form.control} name="includeMachineCosts" render={({ field }) => (
                            <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                                <div className="space-y-0.5">
                                    <FormLabel>¿Incluir Costes de Máquina?</FormLabel>
                                    <FormDescription>Activa para añadir costes de amortización y reparación.</FormDescription>
                                </div>
                                <FormControl><Switch checked={field.value} onCheckedChange={field.onChange} /></FormControl>
                            </FormItem>
                        )} />
                        {watchedValues.includeMachineCosts && (
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
                              <FormField control={form.control} name="printerCost" render={({ field }) => (
                                  <FormItem><FormLabel>Coste de la impresora</FormLabel><FormControl><Input type="number" {...field} /></FormControl></FormItem>
                              )} />
                              <FormField control={form.control} name="investmentReturnYears" render={({ field }) => (
                                  <FormItem><FormLabel>Retorno de la inversión (años)</FormLabel><FormControl><Input type="number" {...field} /></FormControl></FormItem>
                              )} />
                               <FormField control={form.control} name="repairCost" render={({ field }) => (
                                  <FormItem><FormLabel>Coste de reparación</FormLabel><FormControl><Input type="number" {...field} /></FormControl><FormDescription>Coste fijo por trabajo.</FormDescription></FormItem>
                              )} />
                            </div>
                        )}
                      <Separator className="my-6" />
                      <div className="flex justify-between font-medium text-lg">
                          <span>Coste total de máquina y mantenimiento:</span>
                          <span className="text-primary">{formatCurrency(calculations.currentMachineCost)}</span>
                      </div>
                    </div>
                    <Separator/>
                    <div>
                      <h3 className="font-semibold mb-2">Otros Costes</h3>
                        {fields.map((field, index) => (
                            <div key={field.id} className="flex items-end gap-2 mb-2">
                            <FormField control={form.control} name={`otherCosts.${index}.name`} render={({ field }) => (<FormItem className="flex-grow"><FormLabel className={index > 0 ? 'sr-only' : ''}>Nombre del Artículo</FormLabel><FormControl><Input placeholder="Ej: Tornillos, Imanes" {...field} /></FormControl><FormMessage /></FormItem>)} />
                            <FormField control={form.control} name={`otherCosts.${index}.price`} render={({ field }) => (<FormItem><FormLabel className={index > 0 ? 'sr-only' : ''}>Precio</FormLabel><FormControl><Input type="number" {...field} /></FormControl><FormMessage /></FormItem>)} />
                            <Button type="button" variant="ghost" size="icon" onClick={() => remove(index)} className="text-destructive"><Trash2 size={16} /></Button>
                            </div>
                        ))}
                        <Button type="button" variant="outline" size="sm" onClick={() => append({ name: '', price: 0 })} className="mt-2"><PlusCircle className="mr-2 h-4 w-4" /> Añadir Línea de Coste</Button>
                    </div>
                  </div>
                </AccordionContent>
              </AccordionItem>
            </Card>
          
            <Card>
              <AccordionItem value="final-price" className="border-b-0">
                <AccordionTrigger className="p-6 hover:no-underline">
                  <div className="text-left">
                      <CardTitle className="font-headline text-2xl flex items-center gap-2"><DollarSign className="text-primary"/> Precio Final</CardTitle>
                      <CardDescription>Establece tu margen de beneficio e impuestos para calcular el precio final.</CardDescription>
                  </div>
                </AccordionTrigger>
                <AccordionContent className="p-0">
                  <CardContent className="pt-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <FormField control={form.control} name="profitPercentage" render={({ field }) => (<FormItem><FormLabel>Porcentaje de Beneficio (%)</FormLabel><FormControl><Input type="number" {...field} /></FormControl></FormItem>)} />
                      <FormField control={form.control} name="vatPercentage" render={({ field }) => (<FormItem><FormLabel>IVA (%)</FormLabel><FormControl><Input type="number" {...field} /></FormControl></FormItem>)} />
                    </div>
                  </CardContent>
                  <CardFooter className="bg-muted/50 p-6 rounded-b-lg">
                      <div className="w-full space-y-2">
                          <div className="flex justify-between text-sm"><span>Sub-total</span><span>{formatCurrency(calculations.subTotal)}</span></div>
                          <div className="flex justify-between text-sm"><span>Beneficio</span><span>{formatCurrency(calculations.profitAmount)}</span></div>
                          <div className="flex justify-between text-sm"><span>IVA</span><span>{formatCurrency(calculations.vatAmount)}</span></div>
                          <Separator className="my-2" />
                          <div className="flex justify-between text-2xl font-bold text-primary">
                              <span className="font-headline">Precio Final</span>
                              <span>{formatCurrency(calculations.finalPrice)}</span>
                          </div>
                      </div>
                  </CardFooter>
                </AccordionContent>
              </AccordionItem>
            </Card>
          </Accordion>
          
          <div className="flex flex-col sm:flex-row gap-4 justify-end pt-4">
              <Button onClick={handleNewProject} variant="outline" size="default" className="w-full sm:w-auto">
                  <FilePlus className="mr-2 h-4 w-4" /> Nuevo Proyecto
              </Button>
              <Button onClick={handleSaveProject} disabled={isSaving} size="default" className="w-full sm:w-auto">
                {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                {isSaving ? 'Guardando...' : 'Guardar Proyecto'}
              </Button>
              <Button type="button" onClick={handleShare} variant="outline" className="w-full sm:w-auto"><Share2 className="mr-2 h-4 w-4"/> Compartir</Button>
              <Button type="button" onClick={handlePrint} className="w-full sm:w-auto bg-accent text-accent-foreground hover:bg-accent/80 transition-transform hover:scale-105"><Printer className="mr-2 h-4 w-4"/> Guardar en PDF</Button>
          </div>
        </div>

        <div className="hidden print:block">
            <PrintSummary form={form} calculations={calculations} />
        </div>
      </Form>
    </TooltipProvider>
  );
}

    
