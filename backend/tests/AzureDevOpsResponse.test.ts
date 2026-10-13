import assert from "node:assert/strict";
import test from "node:test";
import axios, { AxiosError } from "axios";
import { azureCollection, azureFailureMessage } from "../src/services/AzureDevOpsResponse";
import { systemConfigurationService } from "../src/services/SystemConfigurationService";

test("resposta HTML ou JSON inválido não comprova conexão nem carteira vazia e não vaza seu conteúdo",()=>{
  const secretBody="<!DOCTYPE html><html>credential-test-DO-NOT-PRINT</html>";
  for(const response of [{data:secretBody,status:200,headers:{"content-type":"text/html"}}, {data:{message:"credential-test-DO-NOT-PRINT"},status:200}])
    assert.throws(()=>azureCollection(response,"workItems","teste de conexão"),(error:Error)=>{
      assert.match(error.message,/Resposta inválida.*HTTP 200/);
      assert.match(error.message,/Integrações/);
      assert.doesNotMatch(error.message,/credential-test/);return true;
    });
  assert.deepEqual(azureCollection({data:{workItems:[]}},"workItems","teste"),[]);
  assert.deepEqual(azureCollection({data:{values:[{id:1}]}},["values","value"],"Reporting"),[{id:1}]);
});

test("redirecionamentos e falhas de autenticação têm diagnóstico seguro",()=>{
  for(const [status,pattern] of [[302,/redirecionou/],[401,/autenticação/],[403,/permissão/],[404,/organização e projeto/]] as const){
    const error=new AxiosError("unsafe-response-body",undefined,undefined,undefined,{status,data:"unsafe-response-body"} as any);
    const message=azureFailureMessage(error);
    assert.match(message,pattern);assert.doesNotMatch(message,/unsafe-response-body/);
  }
});

test("teste de configuração recusa HTML com HTTP 200 e bloqueia seguir página de login",async(t)=>{
  const responses=[{data:"<!doctype html><html>Login</html>",status:200,headers:{"content-type":"text/html"}},{data:{workItems:[]},status:200}];
  t.mock.method(axios,"post",async(_url:string,_body:unknown,config:{maxRedirects:number})=>{
    assert.equal(config.maxRedirects,0);return responses.shift();
  });
  const service=systemConfigurationService as unknown as {validateAzureCandidate(input:{organization:string;project:string;pat:string}):Promise<{ok:boolean}>};
  const candidate={organization:"example",project:"SIMER",pat:"test-only"};
  await assert.rejects(service.validateAzureCandidate(candidate),/Resposta inválida.*HTML/);
  assert.equal((await service.validateAzureCandidate(candidate)).ok,true);
});
