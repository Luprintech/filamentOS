import React from 'react';
import type { UseFormReturn } from 'react-hook-form';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Youtube, Instagram } from 'lucide-react';
import { TikTokIcon } from './icons';
import type { FormData } from '@/lib/schema';

interface PrintSummaryProps {
  form: UseFormReturn<FormData>;
  calculations: {
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
  };
}

export const PrintSummary = ({ form, calculations }: PrintSummaryProps) => {
    const values = form.getValues();

    const formatCurrency = (amount: number) => {
      return new Intl.NumberFormat('es-ES', {
        style: 'currency',
        currency: values.currency || 'EUR',
      }).format(amount);
    };

    const [generatedDate, setGeneratedDate] = React.useState('');
    React.useEffect(() => {
        setGeneratedDate(new Date().toLocaleDateString('es-ES'));
    }, []);

    return (
      <div className="p-8 font-body text-black bg-white">
        <header className="flex items-center justify-between mb-8 border-b pb-4">
            <h1 className="font-headline text-2xl font-bold text-primary">Calculadora de costes</h1>
            <img src="/Logo.svg" alt="Logo de Luprintech" width={80} height={80} className="rounded-full" />
        </header>

        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-xl">Trabajo: {values.jobName || 'N/A'}</CardTitle>
            <CardDescription className="text-xs pt-1">Generado el {generatedDate}</CardDescription>
          </CardHeader>
        </Card>

        <div className="grid grid-cols-1 gap-4">
          <Card>
            <CardHeader><CardTitle className="text-lg">Desglose de Costes</CardTitle></CardHeader>
            <CardContent className="space-y-1 text-xs">
              <div className="flex justify-between"><span>Coste de Filamento</span> <strong>{formatCurrency(calculations.filamentCost)}</strong></div>
              <div className="flex justify-between"><span>Coste de Electricidad</span> <strong>{formatCurrency(calculations.electricityCost)}</strong></div>
              <div className="flex justify-between"><span>Coste de Mano de Obra</span> <strong>{formatCurrency(calculations.laborCost)}</strong></div>
              {values.includeMachineCosts && <div className="flex justify-between"><span>Coste de Máquina y Mantenimiento</span> <strong>{formatCurrency(calculations.currentMachineCost)}</strong></div>}
              <div className="flex justify-between"><span>Otros Costes</span> <strong>{formatCurrency(calculations.otherCostsTotal)}</strong></div>
              <Separator />
              <div className="flex justify-between font-bold text-sm"><span>Sub-total</span> <strong>{formatCurrency(calculations.subTotal)}</strong></div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-lg">Precio Final</CardTitle></CardHeader>
            <CardContent className="space-y-1 text-xs">
              <div className="flex justify-between"><span>Sub-total</span> <strong>{formatCurrency(calculations.subTotal)}</strong></div>
              <div className="flex justify-between"><span>Margen de Beneficio ({values.profitPercentage}%)</span> <strong>{formatCurrency(calculations.profitAmount)}</strong></div>
              <Separator />
              <div className="flex justify-between font-bold text-sm"><span>Precio Antes de IVA</span> <strong>{formatCurrency(calculations.priceBeforeVat)}</strong></div>
              <div className="flex justify-between"><span>IVA ({values.vatPercentage}%)</span> <strong>{formatCurrency(calculations.vatAmount)}</strong></div>
              <Separator className="my-1" />
              <div className="flex justify-between text-lg font-bold text-primary"><span>Precio Final</span> <strong>{formatCurrency(calculations.finalPrice)}</strong></div>
            </CardContent>
          </Card>
        </div>
         <footer className="mt-12 pt-6 border-t text-center text-xs text-gray-800">
          <div className="flex justify-center items-center gap-4 text-gray-600">
              <p className="font-semibold text-sm">@luprintech</p>
              <a href="https://www.youtube.com/@Luprintech" target="_blank" rel="noopener noreferrer" aria-label="Canal de YouTube de Luprintech" className="hover:text-primary transition-colors">
                  <Youtube className="h-6 w-6" />
              </a>
              <a href="https://www.instagram.com/luprintech/" target="_blank" rel="noopener noreferrer" aria-label="Perfil de Instagram de Luprintech" className="hover:text-primary transition-colors">
                  <Instagram className="h-6 w-6" />
              </a>
              <a href="https://www.tiktok.com/@luprintech" target="_blank" rel="noopener noreferrer" aria-label="Perfil de TikTok de Luprintech" className="hover:text-primary transition-colors">
                  <TikTokIcon className="h-6 w-6" />
              </a>
          </div>
        </footer>
      </div>
    );
  };

PrintSummary.displayName = 'PrintSummary';
