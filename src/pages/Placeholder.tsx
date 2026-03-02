import { useLocation } from 'react-router-dom';
import { Construction } from 'lucide-react';

export default function Placeholder() {
  const location = useLocation();
  const pageName = location.pathname.split('/').filter(Boolean).pop() || 'Página';

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center">
      <Construction className="h-12 w-12 text-muted-foreground mb-4" />
      <h1 className="text-2xl font-bold capitalize mb-2">{pageName.replace(/-/g, ' ')}</h1>
      <p className="text-muted-foreground">Esta página será implementada nas próximas fases.</p>
    </div>
  );
}
