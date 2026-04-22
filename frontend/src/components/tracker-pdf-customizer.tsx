import { useState, useEffect, useRef, useCallback } from 'react';
import { motion } from 'framer-motion';
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle 
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { usePdfCustomization, PdfCustomization } from '@/features/calculator/api/use-pdf-customization';
import { useTrackerPdf, TrackerPdfData } from '@/features/tracker/api/use-tracker-pdf';
import { 
  Palette, 
  Eye, 
  Save, 
  FileDown, 
  X,
  Loader2,
  Sparkles
} from 'lucide-react';

interface TrackerPdfCustomizerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  trackerData: TrackerPdfData;
}

// Color presets profesionales
const COLOR_PRESETS = [
  { 
    name: 'Profesional', 
    primary: '#29aae1', 
    secondary: '#333333', 
    accent: '#f0f4f8' 
  },
  { 
    name: 'Moderno', 
    primary: '#6366f1', 
    secondary: '#1e293b', 
    accent: '#f1f5f9' 
  },
  { 
    name: 'Cálido', 
    primary: '#f97316', 
    secondary: '#431407', 
    accent: '#fff7ed' 
  },
  { 
    name: 'Natural', 
    primary: '#10b981', 
    secondary: '#064e3b', 
    accent: '#ecfdf5' 
  },
];

export function TrackerPdfCustomizer({ open, onOpenChange, trackerData }: TrackerPdfCustomizerProps) {
  const { toast } = useToast();
  const {
    config: savedConfig,
    isLoading,
    saveConfig,
    isSavingConfig,
    uploadLogo,
    isUploadingLogo,
  } = usePdfCustomization();

  const {
    generatePreview,
    isGeneratingPreview,
    generatePdf,
    isGeneratingPdf,
  } = useTrackerPdf();

  const [config, setConfig] = useState<PdfCustomization>({
    logoPath: null,
    primaryColor: '#29aae1',
    secondaryColor: '#333333',
    accentColor: '#f0f4f8',
    companyName: null,
    footerText: null,
    showMachineCosts: true,
    showBreakdown: true,
    showOtherCosts: true,
    showLaborCosts: true,
    showElectricity: true,
    templateName: 'default',
  });

  const [previewHtml, setPreviewHtml] = useState<string>('');
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  // Load saved config
  useEffect(() => {
    if (savedConfig) {
      setConfig(savedConfig);
    }
  }, [savedConfig]);

  // Auto-generate preview when config changes
  useEffect(() => {
    if (open) {
      handleGeneratePreview();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config, open]);

  const handleLogoUpload = async (file: File) => {
    if (file.size > 2 * 1024 * 1024) {
      toast({
        title: 'Archivo muy grande',
        description: 'El logo debe pesar menos de 2 MB',
        variant: 'destructive',
      });
      return;
    }

    if (!['image/png', 'image/jpeg', 'image/jpg', 'image/svg+xml'].includes(file.type)) {
      toast({
        title: 'Formato no válido',
        description: 'Solo se permiten imágenes PNG, JPG o SVG',
        variant: 'destructive',
      });
      return;
    }

    try {
      const logoPath = await uploadLogo(file);
      setConfig(prev => ({ ...prev, logoPath }));
    } catch (error) {
      // Error handled by mutation
    }
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);

    const file = e.dataTransfer.files[0];
    if (file) {
      handleLogoUpload(file);
    }
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    setIsDragging(false);
  }, []);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleLogoUpload(file);
    }
  };

  const handleGeneratePreview = async () => {
    try {
      const html = await generatePreview({ trackerData, customization: config });
      setPreviewHtml(html);
    } catch (error) {
      // Error handled by mutation
    }
  };

  const handleSaveConfig = () => {
    saveConfig(config);
  };

  const handleGeneratePdf = () => {
    generatePdf({ trackerData, customization: config });
  };

  const applyPreset = (preset: typeof COLOR_PRESETS[0]) => {
    setConfig(prev => ({
      ...prev,
      primaryColor: preset.primary,
      secondaryColor: preset.secondary,
      accentColor: preset.accent,
    }));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[95vw] h-[95vh] p-0 gap-0">
        {/* Header */}
        <DialogHeader className="px-6 py-4 border-b">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-primary/10 rounded-lg">
                <Sparkles className="h-5 w-5 text-primary" />
              </div>
              <div>
                <DialogTitle className="text-xl font-bold">Customizar PDF del Tracker</DialogTitle>
                <p className="text-sm text-muted-foreground">
                  Personaliza el reporte de tu proyecto con logo, colores y marca
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleSaveConfig}
                disabled={isSavingConfig}
              >
                {isSavingConfig ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
                <span className="ml-2">Guardar</span>
              </Button>
              <Button
                size="sm"
                onClick={handleGeneratePdf}
                disabled={isGeneratingPdf}
              >
                {isGeneratingPdf ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <FileDown className="h-4 w-4" />
                )}
                <span className="ml-2">Generar PDF</span>
              </Button>
            </div>
          </div>
        </DialogHeader>

        {/* Content */}
        <div className="flex-1 overflow-hidden">
          <div className="grid grid-cols-2 h-full">
            {/* Left Panel - Controls */}
            <div className="border-r overflow-y-auto p-6">
              <div className="space-y-6">
                {/* Logo Upload */}
                <div className="space-y-3">
                  <Label className="text-base font-semibold">Logo de la Empresa</Label>
                  <div
                    className={`
                      relative border-2 border-dashed rounded-lg p-6 transition-all cursor-pointer
                      ${isDragging ? 'border-primary bg-primary/5' : 'border-gray-300 hover:border-primary'}
                    `}
                    onDrop={handleDrop}
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/png,image/jpeg,image/jpg,image/svg+xml"
                      className="hidden"
                      onChange={handleFileSelect}
                    />

                    <div className="flex flex-col items-center gap-3">
                      {config.logoPath ? (
                        <>
                          <img
                            src={config.logoPath}
                            alt="Logo preview"
                            className="max-h-24 max-w-full object-contain"
                          />
                          <p className="text-sm text-muted-foreground">
                            Click o arrastra para cambiar
                          </p>
                        </>
                      ) : (
                        <>
                            {isUploadingLogo && (
                              <Loader2 className="h-6 w-6 text-primary animate-spin" />
                            )}
                            <div className="text-center">
                              <p className="text-sm font-medium">
                                Arrastra tu logo aquí o haz click
                              </p>
                              <p className="text-xs text-muted-foreground mt-1">
                                PNG, JPG o SVG (max 2 MB)
                              </p>
                            </div>
                          </>
                      )}
                    </div>

                    {config.logoPath && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="absolute top-2 right-2"
                        onClick={(e) => {
                          e.stopPropagation();
                          setConfig(prev => ({ ...prev, logoPath: null }));
                        }}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </div>

                {/* Company Name */}
                <div className="space-y-2">
                  <Label htmlFor="companyName">Nombre de la Empresa (opcional)</Label>
                  <Input
                    id="companyName"
                    placeholder="Ej: Luprintech"
                    value={config.companyName || ''}
                    onChange={(e) => setConfig(prev => ({ ...prev, companyName: e.target.value }))}
                  />
                </div>

                {/* Color Presets */}
                <div className="space-y-3">
                  <Label className="text-base font-semibold">Plantillas de Color</Label>
                  <div className="grid grid-cols-2 gap-2">
                    {COLOR_PRESETS.map((preset) => (
                      <Button
                        key={preset.name}
                        variant="outline"
                        className="justify-start"
                        onClick={() => applyPreset(preset)}
                      >
                        <div className="flex items-center gap-2">
                          <div className="flex gap-1">
                            <div 
                              className="w-4 h-4 rounded-full border" 
                              style={{ background: preset.primary }}
                            />
                            <div 
                              className="w-4 h-4 rounded-full border" 
                              style={{ background: preset.secondary }}
                            />
                          </div>
                          <span className="text-sm">{preset.name}</span>
                        </div>
                      </Button>
                    ))}
                  </div>
                </div>

                {/* Custom Colors */}
                <div className="space-y-4">
                  <Label className="text-base font-semibold">Colores Personalizados</Label>
                  
                  <div className="grid grid-cols-3 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="primaryColor" className="text-sm">Primario</Label>
                      <div className="flex gap-2">
                        <Input
                          id="primaryColor"
                          type="color"
                          value={config.primaryColor}
                          onChange={(e) => setConfig(prev => ({ ...prev, primaryColor: e.target.value }))}
                          className="h-10 w-full"
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="secondaryColor" className="text-sm">Secundario</Label>
                      <div className="flex gap-2">
                        <Input
                          id="secondaryColor"
                          type="color"
                          value={config.secondaryColor}
                          onChange={(e) => setConfig(prev => ({ ...prev, secondaryColor: e.target.value }))}
                          className="h-10 w-full"
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="accentColor" className="text-sm">Acento</Label>
                      <div className="flex gap-2">
                        <Input
                          id="accentColor"
                          type="color"
                          value={config.accentColor}
                          onChange={(e) => setConfig(prev => ({ ...prev, accentColor: e.target.value }))}
                          className="h-10 w-full"
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Footer Text */}
                <div className="space-y-2">
                  <Label htmlFor="footerText">Texto del Pie de Página (opcional)</Label>
                  <Textarea
                    id="footerText"
                    placeholder="Ej: Gracias por confiar en nosotros"
                    value={config.footerText || ''}
                    onChange={(e) => setConfig(prev => ({ ...prev, footerText: e.target.value }))}
                    rows={3}
                  />
                </div>
              </div>
            </div>

            {/* Right Panel - Preview */}
            <div className="bg-gray-50 dark:bg-gray-900 flex flex-col">
              <div className="p-4 border-b bg-white dark:bg-gray-800 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Eye className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium">Vista Previa</span>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleGeneratePreview}
                  disabled={isGeneratingPreview}
                >
                  {isGeneratingPreview ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : null}
                  Actualizar
                </Button>
              </div>

              <div className="flex-1 p-4 overflow-auto">
                {isGeneratingPreview ? (
                  <div className="h-full flex items-center justify-center">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                  </div>
                ) : previewHtml ? (
                  <iframe
                    ref={iframeRef}
                    srcDoc={previewHtml}
                    className="w-full h-full border rounded-lg bg-white shadow-lg"
                    title="PDF Preview"
                  />
                ) : (
                  <div className="h-full flex items-center justify-center text-muted-foreground">
                    <p>Actualiza la vista previa para ver los cambios</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
