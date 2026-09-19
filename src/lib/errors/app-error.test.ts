import {
    AppError,
    conflict,
    forbidden,
    internalError,
    isAppError,
    notFound,
    unauthenticated,
    validationError,
} from "@/lib/errors";

describe("AppError", () => {
    it("deriva o status HTTP a partir do codigo", () => {
        expect(validationError().status).toBe(400);
        expect(unauthenticated().status).toBe(401);
        expect(forbidden().status).toBe(403);
        expect(notFound().status).toBe(404);
        expect(conflict().status).toBe(409);
        expect(internalError().status).toBe(500);
    });

    it("continua sendo um Error (instanceof e stack preservados)", () => {
        const error = conflict("slug em uso");

        expect(error).toBeInstanceOf(Error);
        expect(isAppError(error)).toBe(true);
        expect(error.stack).toBeDefined();
    });

    it("nao reconhece um Error comum como AppError", () => {
        expect(isAppError(new Error("qualquer"))).toBe(false);
    });

    describe("toBody", () => {
        it("usa sempre o mesmo formato", () => {
            expect(validationError("Dados invalidos.").toBody()).toEqual({
                error: { code: "VALIDATION_ERROR", message: "Dados invalidos." },
            });
        });

        it("inclui details quando existem", () => {
            const details = [{ field: "slug", message: "formato invalido" }];

            expect(validationError("Dados invalidos.", details).toBody()).toEqual({
                error: {
                    code: "VALIDATION_ERROR",
                    message: "Dados invalidos.",
                    details,
                },
            });
        });

        it("omite details quando a lista esta vazia", () => {
            expect(validationError("Dados invalidos.", []).toBody().error).not.toHaveProperty(
                "details",
            );
        });

        it("nao expoe stack nem name no corpo", () => {
            const body = JSON.stringify(new AppError("NOT_FOUND", "sumiu").toBody());

            expect(body).not.toContain("stack");
            expect(body).not.toContain("AppError");
        });
    });

    it("monta a mensagem de notFound com o nome do recurso", () => {
        expect(notFound("Monitor").message).toBe("Monitor nao encontrado.");
    });
});
