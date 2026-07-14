import { NextResponse, type NextRequest } from "next/server";

// =====================================================================
// Trava de acesso mínima (Blueprint RF-01 adaptado; decisão do usuário:
// "a trava mais simples possível só para impedir acesso externo").
// HTTP Basic Auth contra credenciais de ambiente. Se BASIC_AUTH_USER /
// BASIC_AUTH_PASSWORD não estiverem definidos, NÃO há trava (dev local).
// Não é autenticação por usuário — é um portão único para uso interno.
// =====================================================================

export function middleware(request: NextRequest): NextResponse {
  const user = process.env.BASIC_AUTH_USER;
  const password = process.env.BASIC_AUTH_PASSWORD;

  // Sem credenciais configuradas → sem trava (ambiente de desenvolvimento).
  if (!user || !password) return NextResponse.next();

  const header = request.headers.get("authorization");
  if (header?.startsWith("Basic ")) {
    try {
      const decoded = atob(header.slice(6));
      const separator = decoded.indexOf(":");
      const providedUser = decoded.slice(0, separator);
      const providedPass = decoded.slice(separator + 1);
      if (providedUser === user && providedPass === password) {
        return NextResponse.next();
      }
    } catch {
      // cabeçalho malformado → cai no 401 abaixo
    }
  }

  return new NextResponse("Acesso restrito.", {
    status: 401,
    headers: {
      "WWW-Authenticate": 'Basic realm="Ilha Prospect", charset="UTF-8"',
    },
  });
}

// Aplica a todas as rotas, exceto assets estáticos do Next.
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
