import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

const NOTICE_KEY = 'filamentos_data_loss_notice_v1';

export function DataLossNoticeModal() {
  const [open, setOpen] = useState(() => !localStorage.getItem(NOTICE_KEY));

  const handleDismiss = () => {
    localStorage.setItem(NOTICE_KEY, 'true');
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={() => {}}>
      <DialogContent
        className="max-w-md [&>button:first-child]:hidden"
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle className="text-lg">Un aviso importante</DialogTitle>
        </DialogHeader>

        <div className="space-y-3 text-sm text-muted-foreground leading-relaxed">
          <p>
            Durante mayo, FilamentOS estuvo caída por un problema técnico en el
            servidor. Como consecuencia, los datos registrados hasta esa fecha
            se perdieron.
          </p>
          <p>Sé que muchos de ustedes confiaron en la app y lo siento mucho.</p>
          <p>
            Ya corregí el problema e implementé backups automáticos diarios para
            que esto no vuelva a pasar. La app está funcionando y más estable
            que nunca.
          </p>
          <p>Gracias por la paciencia y por seguir usando FilamentOS.</p>
        </div>

        <div className="pt-2 flex justify-end">
          <Button onClick={handleDismiss}>Entendido</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
