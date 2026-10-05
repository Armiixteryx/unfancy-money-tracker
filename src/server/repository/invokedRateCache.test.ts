import { describe,it,expect,vi } from "vitest";
import { LambdaClient } from "@aws-sdk/client-lambda";
import { InvokedRateCache,rateCacheOperationSchema } from "./invokedRateCache";
const record={ base:"USD" as const,quote:"COP" as const,rate:"4000",effectiveDate:"2026-10-04",fetchedAt:"2026-10-04T00:00:00.000Z",provider:"frankfurter-blended" as const,status:"fresh" as const };
describe("IAM-invoked rate cache boundary",() => {
  it("validates requests and returned values",async () => {
    const client=new LambdaClient({ region:"us-east-1" });const send=vi.spyOn(client,"send");
    send.mockResolvedValue({ Payload:Buffer.from(JSON.stringify(record)) } as never);
    const cache=new InvokedRateCache(client,"private-cache");expect(await cache.get("latest:USD:COP")).toEqual(record);
    const command=send.mock.calls[0]![0] as { input:{ FunctionName:string;InvocationType:string;Payload:Uint8Array } };
    expect(command.input.FunctionName).toBe("private-cache");expect(command.input.InvocationType).toBe("RequestResponse");
    expect(JSON.parse(Buffer.from(command.input.Payload).toString())).toEqual({ operation:"get",key:"latest:USD:COP" });
    send.mockResolvedValueOnce({ Payload:Buffer.from('{"rate":0}') } as never);
    await expect(cache.get("latest:USD:COP")).rejects.toThrow();
  });
  it("propagates invocation failures so the provider can preserve upstream results or stale fallbacks",async () => {
    const client=new LambdaClient({ region:"us-east-1" });vi.spyOn(client,"send").mockResolvedValue({ FunctionError:"Unhandled",Payload:Buffer.from("null") } as never);
    const cache=new InvokedRateCache(client,"private-cache");await expect(cache.get("synthetic")).rejects.toThrow("Rate cache unavailable");await expect(cache.set("synthetic",record)).rejects.toThrow("Rate cache unavailable");
    expect(rateCacheOperationSchema.safeParse({ operation:"get",key:"synthetic",authorization:"untrusted" }).success).toBe(false);
    expect(rateCacheOperationSchema.safeParse({ operation:"delete",key:"synthetic" }).success).toBe(false);
  });
});
