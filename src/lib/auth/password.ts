import { hash, verify } from "@node-rs/argon2";

// Parametros de custo recomendados pelo OWASP para argon2id
// (m=19MiB, t=2, p=1) -- tambem sao o default da biblioteca, mas ficam
// explicitos aqui para nao dependerem de um default que pode mudar numa
// atualizacao da dependencia.
// @node-rs/argon2 expoe Algorithm como `const enum`, que nao pode ser
// referenciado com isolatedModules ligado (exigido pelo SWC do Next). 2 e o
// valor de Algorithm.Argon2id.
const ARGON2_OPTIONS = {
    algorithm: 2,
    memoryCost: 19456,
    timeCost: 2,
    parallelism: 1,
};

export function hashPassword(plainPassword: string): Promise<string> {
    return hash(plainPassword, ARGON2_OPTIONS);
}

// O hash PHC ja carrega os parametros com que foi gerado -- nao precisa
// (nem deve) repassar ARGON2_OPTIONS aqui, ou uma mudanca futura de custo
// quebraria a verificacao de hashes antigos.
export function verifyPassword(plainPassword: string, passwordHash: string): Promise<boolean> {
    return verify(passwordHash, plainPassword);
}

// Hash valido de uma senha que ninguem usa, gerado uma vez no boot com os
// mesmos parametros de custo. O login (#15) verifica contra ele quando o
// e-mail nao existe, para que o tempo de resposta nao revele se a conta
// existe (issue #13: "verificacao deve ser resistente a timing attack").
// Promise memoizada porque hashPassword tem custo de CPU proposital (~o
// mesmo de um hash real) -- gerar de novo a cada request desperdicaria
// exatamente o tempo que o padrao busca economizar.
let dummyHashPromise: Promise<string> | null = null;

export function dummyPasswordHash(): Promise<string> {
    dummyHashPromise ??= hashPassword("uma-senha-que-ninguem-usa-e-so-para-timing");
    return dummyHashPromise;
}
