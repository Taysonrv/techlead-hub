import net from "node:net";
import tls from "node:tls";

type MailMessage = {
  to: string;
  subject: string;
  text: string;
  html: string;
};

type SmtpConfiguration = {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  password: string;
  from: string;
};

type MailSocket =
  | net.Socket
  | tls.TLSSocket;

export function isEmailDeliveryConfigured() {
  return Boolean(
    process.env.SMTP_HOST?.trim() &&
    process.env.SMTP_USER?.trim() &&
    process.env.SMTP_PASSWORD &&
    process.env.SMTP_FROM?.trim()
  );
}

export async function sendPasswordResetEmail(input: {
  name: string;
  email: string;
  token: string;
  expiresAt: Date;
}) {
  const configuration =
    readConfiguration();

  const baseUrl =
    process.env.PASSWORD_RESET_URL?.trim() ||
    "http://localhost:3333/login";

  const separator =
    baseUrl.includes("?")
      ? "&"
      : "?";

  const resetUrl =
    `${baseUrl}${separator}resetToken=${encodeURIComponent(
      input.token
    )}`;

  const expiration =
    input.expiresAt.toLocaleString(
      "pt-BR"
    );

  await sendMail(
    configuration,
    {
      to:
        input.email,
      subject:
        "Recuperação de senha | TechLead Hub",
      text:
        `Olá, ${input.name}.\n\nRecebemos uma solicitação para redefinir sua senha no TechLead Hub.\n\nAbra o link: ${resetUrl}\n\nO link expira em ${expiration}. Se você não solicitou esta alteração, ignore esta mensagem.`,
      html:
        `<p>Olá, <strong>${escapeHtml(input.name)}</strong>.</p><p>Recebemos uma solicitação para redefinir sua senha no TechLead Hub.</p><p><a href="${escapeHtml(resetUrl)}" style="display:inline-block;padding:12px 18px;background:#18c77a;color:#071a12;text-decoration:none;border-radius:8px;font-weight:700">Criar nova senha</a></p><p>O link expira em <strong>${escapeHtml(expiration)}</strong>.</p><p>Se você não solicitou esta alteração, ignore esta mensagem.</p>`,
    }
  );
}

function readConfiguration():
  SmtpConfiguration {
  const host =
    process.env.SMTP_HOST?.trim() ||
    "";
  const port =
    Number(
      process.env.SMTP_PORT ||
      "587"
    );
  const user =
    process.env.SMTP_USER?.trim() ||
    "";
  const password =
    process.env.SMTP_PASSWORD ||
    "";
  const from =
    process.env.SMTP_FROM?.trim() ||
    "";
  const secure =
    process.env.SMTP_SECURE === "true" ||
    port === 465;

  if (
    !host ||
    !Number.isInteger(port) ||
    port < 1 ||
    port > 65535 ||
    !user ||
    !password ||
    !from
  ) {
    throw new Error(
      "O e-mail de recuperação ainda não foi configurado pelo administrador."
    );
  }

  return {
    host,
    port,
    secure,
    user,
    password,
    from,
  };
}

async function sendMail(
  configuration:
    SmtpConfiguration,
  message:
    MailMessage
) {
  let socket =
    await connect(
      configuration
    );

  let reader =
    createResponseReader(
      socket
    );

  try {
    await reader.expect(
      [220]
    );

    await command(
      socket,
      reader,
      `EHLO ${getClientName()}`,
      [250]
    );

    if (
      !configuration.secure
    ) {
      await command(
        socket,
        reader,
        "STARTTLS",
        [220]
      );

      socket =
        await upgradeToTls(
          socket,
          configuration.host
        );

      reader =
        createResponseReader(
          socket
        );

      await command(
        socket,
        reader,
        `EHLO ${getClientName()}`,
        [250]
      );
    }

    await command(
      socket,
      reader,
      "AUTH LOGIN",
      [334]
    );

    await command(
      socket,
      reader,
      Buffer.from(
        configuration.user
      ).toString("base64"),
      [334]
    );

    await command(
      socket,
      reader,
      Buffer.from(
        configuration.password
      ).toString("base64"),
      [235]
    );

    await command(
      socket,
      reader,
      `MAIL FROM:<${extractAddress(configuration.from)}>`,
      [250]
    );

    await command(
      socket,
      reader,
      `RCPT TO:<${extractAddress(message.to)}>`,
      [250, 251]
    );

    await command(
      socket,
      reader,
      "DATA",
      [354]
    );

    const dataResponse =
      reader.expect(
        [250]
      );

    socket.write(
      `${buildMimeMessage(
        configuration.from,
        message
      )}\r\n.\r\n`
    );

    await dataResponse;

    await command(
      socket,
      reader,
      "QUIT",
      [221]
    );
  } finally {
    socket.destroy();
  }
}

function connect(
  configuration:
    SmtpConfiguration
) {
  return new Promise<MailSocket>(
    (
      resolve,
      reject
    ) => {
      let socket:
        MailSocket;

      const onError = (
        error:
          Error
      ) => {
        reject(error);
      };

      const onConnect =
        () => {
          socket.removeListener(
            "error",
            onError
          );
          resolve(socket);
        };

      if (
        configuration.secure
      ) {
        socket =
          tls.connect(
            {
              host:
                configuration.host,
              port:
                configuration.port,
              servername:
                configuration.host,
              rejectUnauthorized:
                true,
            },
            onConnect
          );
      } else {
        socket =
          net.connect(
            {
              host:
                configuration.host,
              port:
                configuration.port,
            },
            onConnect
          );
      }

      socket.setTimeout(
        20_000,
        () => {
          socket.destroy(
            new Error(
              "Tempo limite excedido ao conectar ao servidor de e-mail."
            )
          );
        }
      );

      socket.once(
        "error",
        onError
      );
    }
  );
}

function upgradeToTls(
  socket:
    MailSocket,
  host:
    string
) {
  return new Promise<tls.TLSSocket>(
    (
      resolve,
      reject
    ) => {
      socket.removeAllListeners(
        "data"
      );

      const secureSocket =
        tls.connect(
          {
            socket,
            servername:
              host,
            rejectUnauthorized:
              true,
          },
          () => {
            resolve(
              secureSocket
            );
          }
        );

      secureSocket.once(
        "error",
        reject
      );
    }
  );
}

function createResponseReader(
  socket:
    MailSocket
) {
  let buffer =
    "";
  const pending:
    Array<{
      resolve:
        (response: string) => void;
      reject:
        (error: Error) => void;
      expected:
        number[];
    }> =
    [];

  socket.on(
    "data",
    (
      chunk
    ) => {
      buffer +=
        chunk.toString(
          "utf8"
        );

      while (
        pending.length
      ) {
        const match =
          buffer.match(
            /(?:^|\r\n)(\d{3}) ([^\r\n]*)\r\n/
          );

        if (!match) {
          break;
        }

        const end =
          (match.index ?? 0) +
          match[0].length;
        const response =
          buffer.slice(
            0,
            end
          );
        buffer =
          buffer.slice(
            end
          );

        const current =
          pending.shift();
        const code =
          Number(
            match[1]
          );

        if (
          current?.expected
            .includes(code)
        ) {
          current.resolve(
            response
          );
        } else {
          current?.reject(
            new Error(
              `Servidor SMTP recusou a operação: ${response.trim()}`
            )
          );
        }
      }
    }
  );

  socket.on(
    "error",
    (
      error
    ) => {
      while (
        pending.length
      ) {
        pending
          .shift()
          ?.reject(error);
      }
    }
  );

  return {
    expect(
      expected:
        number[]
    ) {
      return new Promise<string>(
        (
          resolve,
          reject
        ) => {
          pending.push({
            resolve,
            reject,
            expected,
          });
        }
      );
    },
  };
}

async function command(
  socket:
    MailSocket,
  reader:
    ReturnType<
      typeof createResponseReader
    >,
  value:
    string,
  expected:
    number[]
) {
  const response =
    reader.expect(
      expected
    );

  socket.write(
    `${value}\r\n`
  );

  return response;
}

function buildMimeMessage(
  from:
    string,
  message:
    MailMessage
) {
  const boundary =
    `techlead-hub-${Date.now()}`;

  return [
    `From: ${from}`,
    `To: ${message.to}`,
    `Subject: =?UTF-8?B?${Buffer.from(message.subject).toString("base64")}?=`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    "",
    `--${boundary}`,
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
    "",
    wrapBase64(
      Buffer.from(
        message.text
      ).toString(
        "base64"
      )
    ),
    `--${boundary}`,
    "Content-Type: text/html; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
    "",
    wrapBase64(
      Buffer.from(
        message.html
      ).toString(
        "base64"
      )
    ),
    `--${boundary}--`,
  ]
    .join(
      "\r\n"
    )
    .replace(
      /\r\n\./g,
      "\r\n.."
    );
}

function wrapBase64(
  value:
    string
) {
  return value.match(
    /.{1,76}/g
  )?.join(
    "\r\n"
  ) ?? "";
}

function extractAddress(
  value:
    string
) {
  const match =
    value.match(
      /<([^>]+)>/
    );

  return (
    match?.[1] ||
    value
  ).trim();
}

function getClientName() {
  return (
    process.env.COMPUTERNAME ||
    "techlead-hub"
  )
    .replace(
      /[^a-zA-Z0-9.-]/g,
      "-"
    );
}

function escapeHtml(
  value:
    string
) {
  return value.replace(
    /[&<>"']/g,
    (
      character
    ) => {
      const entities:
        Record<string, string> = {
        "&":
          "&amp;",
        "<":
          "&lt;",
        ">":
          "&gt;",
        '"':
          "&quot;",
        "'":
          "&#039;",
      };

      return (
        entities[
          character
        ] ??
        character
      );
    }
  );
}
