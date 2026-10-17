# TechLead Hub Web — HTTPS e certificado digital

## Decisão de arquitetura

O aplicativo Web recebe HTTP na porta **3333** dentro do container. O certificado
TLS da URL pública deve ser configurado no **ingress, load balancer ou reverse
proxy corporativo**, não no processo Node/Express. Não há necessidade de
`SSL_CERT`, `SSL_KEY` nem de importar um PFX para dentro da imagem TechLead Hub.

Fluxo: navegador HTTPS (443) -> proxy TLS corporativo -> TechLead Hub HTTP (3333).
O banco PostgreSQL é independente do certificado HTTPS e permanece privado.

## Informações necessárias à infraestrutura

- DNS/FQDN aprovado (exemplo: `techlead-hub.aliare.co`);
- Certificado TLS válido para o FQDN, cadeia intermediária completa e chave
  privada, armazenados **somente** na infraestrutura de terminação TLS;
- Certificado emitido pela autoridade interna confiável nos computadores
  corporativos, ou por uma CA pública;
- Política de renovação automatizada e monitoramento de expiração;
- Acesso externo somente via HTTPS/443; acesso à porta 3333 apenas do proxy;
- Proxy com suporte a WebSocket (`Upgrade`/`Connection`) se houver recurso
  de comunicação em tempo real;
- Rede privada e autorização para o PostgreSQL; nunca expor 5432 na internet.

## Variáveis do container (com PostgreSQL externo)

```env
TECHLEAD_HUB_IMAGE=ghcr.io/taysonrv/techlead-hub:<versao_homologada>
TECHLEAD_HUB_PORT=8080
DATABASE_URL=<injetar pelo cofre/ambiente seguro>
JWT_SECRET=<segredo persistente no cofre>
SYSTEM_CONFIG_KEY=<chave de configuracao persistente e COMPATIVEL com SystemSetting>
CORS_ALLOWED_ORIGINS=https://techlead-hub.aliare.co
PASSWORD_RESET_URL=https://techlead-hub.aliare.co/login
TRUST_PROXY=loopback
MIGRATE_ON_START=false
```

`TRUST_PROXY` precisa refletir a **topologia real**. O valor `loopback` é
adequado apenas quando o proxy é realmente considerado loopback pelo Express;
no caso de proxy remoto é necessário configurar as redes/hops confiáveis sob
revisão de segurança, nunca usar `true` indiscriminadamente.

**Banco preexistente:** antes de definir `SYSTEM_CONFIG_KEY`, confirmar que
ela ou a `JWT_SECRET` legada pode descriptografar os registros de
`SystemSetting`; não executar migração sem backup e janela de manutenção.

## Exemplo ilustrativo Nginx (adaptar pela equipe de infraestrutura)

```nginx
server {
    listen 80;
    server_name techlead-hub.aliare.co;
    return 301 https://$host$request_uri;
}
server {
    listen 443 ssl;
    server_name techlead-hub.aliare.co;
    ssl_certificate /etc/ssl/techlead/fullchain.pem;
    ssl_certificate_key /etc/ssl/techlead/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;

    # SSE do chat: desabilite buffering para que eventos cheguem imediatamente.
    location /api/chat/events {
        proxy_pass http://127.0.0.1:8080;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_buffering off;
        proxy_cache off;
        proxy_read_timeout 3600s;
    }

    location / {
        proxy_pass http://127.0.0.1:8080;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```

Se o proxy estiver em outra máquina, substituir `127.0.0.1:8080` pelo endereço
interno alcançável **somente a partir do proxy**. Restringir acesso ao upstream.

## Testes de aceite

1. `https://<fqdn>/health/ready` retorna HTTP 200 com PostgreSQL ready.
2. Navegador apresenta cadeia TLS válida e conexão HTTPS sem conteúdo misto.
3. HTTP redireciona para HTTPS.
4. Login, logout e renovação da sessão funcionam sem laços de autenticação.
5. Dashboard, filtros, API, chat e notificações funcionam via FQDN público.
6. Reiniciar ou substituir a imagem conserva os segredos e os dados do banco.
7. Chat em tempo real: mensagens, presença e indicadores recebidos sem atraso pelo proxy (SSE sem buffering).
8. Não há endpoint HTTP direto do container acessível pela rede pública.
9. Capturar evidências de vigência do certificado e de agendamento da renovação.

O GitHub Actions publica a imagem, mas **não** instala certificado digital
no servidor corporativo. Certificados e seus arquivos privados nunca devem
ser enviados ao GitHub nem commitados no repositório.

## Diagnóstico de certificados e renovação

O repositório **não contém** certificado ou chave privada: a validação final só pode ser realizada no FQDN provisionado pela infraestrutura. O certificado HTTPS do navegador e o certificado/TLS da conexão PostgreSQL são assuntos separados.

Solicite à infraestrutura evidência de: FQDN/SAN válido, certificado vigente, cadeia completa, renovação automatizada, redirecionamento de HTTP, acesso restrito à porta interna e `https://<fqdn>/health/ready` 200. Nunca envie arquivos `.pfx`, `.key` ou senhas ao repositório.

**Atenção:** para o Compose com banco externo (`deploy/docker-compose.example.yml`), as variáveis são `TECHLEAD_HUB_IMAGE` e `TECHLEAD_HUB_PORT`. O `docker-compose.yml` da raiz contém PostgreSQL local e utiliza outros nomes de variáveis; não misture os dois modelos de implantação.
