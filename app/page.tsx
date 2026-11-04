import { MessageCircle, Sparkles } from "lucide-react";

export default function Home() {
  return (
    <main className="flex flex-1 items-center justify-center bg-gradient-to-b from-indigo-50 via-white to-white px-6 py-16">
      <div className="w-full max-w-md text-center sm:max-w-xl">
        <div className="mx-auto mb-8 flex h-16 w-16 items-center justify-center rounded-2xl bg-indigo-600 text-white shadow-lg shadow-indigo-200">
          <Sparkles className="h-8 w-8" aria-hidden="true" />
        </div>

        <h1 className="text-3xl font-bold tracking-tight text-zinc-900 sm:text-4xl">
          Aplicativo Pronto para Criação
        </h1>

        <p className="mt-4 text-base leading-relaxed text-zinc-600 sm:text-lg">
          Converse com o Claude para construir suas funcionalidades.
        </p>

        <div className="mt-10 inline-flex items-center gap-2 rounded-full border border-zinc-200 bg-white px-4 py-2 text-sm text-zinc-500 shadow-sm">
          <MessageCircle className="h-4 w-4 text-indigo-600" aria-hidden="true" />
          Diga o que você quer criar e o Claude faz o resto
        </div>
      </div>
    </main>
  );
}
