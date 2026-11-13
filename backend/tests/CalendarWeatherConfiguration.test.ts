import test from 'node:test';
import assert from 'node:assert/strict';
import {CalendarWeatherService} from '../src/services/CalendarWeatherService';
import {systemConfigurationService} from '../src/services/SystemConfigurationService';
import {prisma} from '../src/database/prisma';

test('clima carrega chave central antes da consulta e preserva cidade do usuário',async(t)=>{
 const prior=process.env.WEATHER_API_KEY;
 t.after(()=>{if(prior===undefined)delete process.env.WEATHER_API_KEY;else process.env.WEATHER_API_KEY=prior;});
 t.mock.method(systemConfigurationService,'loadIntoEnvironment',async()=>{process.env.WEATHER_API_KEY='weather-test-fixture';return new Set(['weatherApiKey']);});
 const service=new CalendarWeatherService();t.mock.method(service,'getLocation',async()=> 'Rio Verde, GO');
 let requests=0;
 t.mock.method(globalThis,'fetch',async(input:any)=>{requests++;const url=new URL(String(input));assert.equal(url.searchParams.get('key'),'weather-test-fixture');assert.equal(url.searchParams.get('q'),'-17.79,-50.91');return new Response(JSON.stringify({location:{name:'Rio Verde',region:'Goiás',country:'Brazil'},forecast:{forecastday:[{date:'2026-11-13',day:{mintemp_c:20,maxtemp_c:30,daily_chance_of_rain:50,condition:{text:'Chuva',icon:'//cdn.weatherapi.com/weather/64x64/day/302.png'}}}]}}),{status:200});});
 const result=await service.getForecast(1);assert.equal(result.configured,true);assert.equal(result.city,'Rio Verde, GO');assert.equal(result.days.length,1);assert.match(result.days[0]!.iconUrl,/^https:\/\/cdn.weatherapi.com\//);assert.equal(requests,1);
});

test('chave do clima é validada antes de gravar',async(t)=>{
 t.mock.method(systemConfigurationService,'loadIntoEnvironment',async()=>new Set<string>());
 t.mock.method(globalThis,'fetch',async()=>new Response('{}',{status:401}));
 const original=prisma.$executeRaw;let writes=0;prisma.$executeRaw=(async()=>{writes++;return 1;}) as typeof original;t.after(()=>{prisma.$executeRaw=original;});
 await assert.rejects(()=>systemConfigurationService.save({weatherApiKey:'invalid-weather-fixture'},1),/não foi aceita/);
 assert.equal(writes,0);
});

test('estado da configuração expõe somente presença da chave do clima',async(t)=>{
 const prior=process.env.WEATHER_API_KEY;process.env.WEATHER_API_KEY='weather-test-fixture';
 t.after(()=>{if(prior===undefined)delete process.env.WEATHER_API_KEY;else process.env.WEATHER_API_KEY=prior;});
 t.mock.method(systemConfigurationService,'loadIntoEnvironment',async()=>new Set(['weatherApiKey']));
 const status=await systemConfigurationService.status();assert.equal(status.weatherConfigured,true);assert.equal('weatherApiKey' in status,false);assert.ok(!JSON.stringify(status).includes('weather-test-fixture'));
});

test('chave válida é salva criptografada e o estado não revela o valor',async(t)=>{
 const oldWeather=process.env.WEATHER_API_KEY,oldShared=process.env.SYSTEM_CONFIG_KEY;
 process.env.SYSTEM_CONFIG_KEY='fixture'.repeat(8);
 t.after(()=>{if(oldWeather===undefined)delete process.env.WEATHER_API_KEY;else process.env.WEATHER_API_KEY=oldWeather;if(oldShared===undefined)delete process.env.SYSTEM_CONFIG_KEY;else process.env.SYSTEM_CONFIG_KEY=oldShared;});
 t.mock.method(systemConfigurationService,'loadIntoEnvironment',async()=>new Set(['weatherApiKey']));
 t.mock.method(globalThis,'fetch',async()=>new Response('{}',{status:200}));
 const originalWrite=prisma.$executeRaw,originalAudit=prisma.auditLog.create;let saved:any[]=[];
 prisma.$executeRaw=(async(...args:any[])=>{saved=args.slice(1);return 1;}) as typeof originalWrite;
 prisma.auditLog.create=(async()=>({})) as typeof originalAudit;
 t.after(()=>{prisma.$executeRaw=originalWrite;prisma.auditLog.create=originalAudit;});
 const result=await systemConfigurationService.save({weatherApiKey:'weather-valid-fixture'},7);
 assert.equal(saved[0],'weatherApiKey');assert.match(saved[1],/^v1:/);assert.ok(!saved[1].includes('weather-valid-fixture'));
 assert.equal(result.weatherConfigured,true);assert.equal(result.weatherCredentialSource,'central');assert.equal('weatherApiKey' in result,false);
});
