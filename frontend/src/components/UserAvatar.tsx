import { Avatar, type SxProps, type Theme } from "@mui/material";
import { useEffect, useState } from "react";
import type { AuthUser } from "../context/AuthContext";
import { api } from "../services/api";

export function UserAvatar({ user, size = 40, sx }: { user: AuthUser; size?: number; sx?: SxProps<Theme> }) {
  const [src, setSrc] = useState<string>();

  useEffect(() => {
    let objectUrl: string | undefined;
    if (!user.avatarUpdatedAt) { setSrc(undefined); return; }
    void api.get<Blob>("/auth/me/avatar", { responseType: "blob" })
      .then((response) => { objectUrl = URL.createObjectURL(response.data); setSrc(objectUrl); })
      .catch(() => setSrc(undefined));
    return () => { if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [user.avatarUpdatedAt]);

  const initials = user.name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("");
  return <Avatar src={src} alt={`Foto de ${user.name}`} sx={{ width: size, height: size, fontSize: size * .32, fontWeight: 800, ...sx }}>{initials}</Avatar>;
}
