"use client";

import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
  DialogClose,
} from "@/components/ui/dialog";

/**
 * Diálogo de "Executar busca". Apenas visual nesta fase — sem lógica de coleta.
 */
function RunSearchDialog() {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button>
          <Search />
          Executar busca
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Executar busca</DialogTitle>
          <DialogDescription>
            Selecione a cidade e a categoria para uma execução manual.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-1">
          <div className="space-y-1.5">
            <label
              htmlFor="search-city"
              className="text-sm font-medium text-text-primary"
            >
              Cidade
            </label>
            <Input id="search-city" placeholder="Ex.: Vitória" />
          </div>

          <div className="space-y-1.5">
            <span className="text-sm font-medium text-text-primary">
              Categoria
            </span>
            <Select>
              <SelectTrigger aria-label="Categoria">
                <SelectValue placeholder="Selecione uma categoria" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="clinicas">Clínicas médicas</SelectItem>
                <SelectItem value="contabilidade">Contabilidades</SelectItem>
                <SelectItem value="advocacia">Advocacia</SelectItem>
                <SelectItem value="odontologia">Odontologia</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter>
          <DialogClose asChild>
            <Button variant="ghost">Cancelar</Button>
          </DialogClose>
          <Button>Iniciar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export { RunSearchDialog };
