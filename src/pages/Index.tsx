import { Waves, Sparkles, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";

const Index = () => {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4 text-center">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 rounded-full bg-primary/10 blur-3xl" />
        <div className="absolute bottom-1/4 right-1/4 w-80 h-80 rounded-full bg-accent/10 blur-3xl" />
      </div>

      <div className="relative z-10 max-w-2xl space-y-8">
        <div className="flex justify-center">
          <div className="rounded-full bg-primary/20 p-4">
            <Waves className="h-10 w-10 text-primary" />
          </div>
        </div>

        <h1 className="text-5xl font-bold tracking-tight text-foreground sm:text-6xl">
          Bem-vindo ao <span className="text-primary">Blue</span>
        </h1>

        <p className="text-lg text-muted-foreground leading-relaxed">
          Uma experiência visual simples, elegante e envolvente — construída com tons de azul.
        </p>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
          <Button size="lg" className="gap-2">
            Começar agora <ArrowRight className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="lg" className="gap-2">
            <Sparkles className="h-4 w-4" /> Saiba mais
          </Button>
        </div>
      </div>
    </div>
  );
};

export default Index;
