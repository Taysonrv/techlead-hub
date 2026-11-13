import { useEffect, useState } from "react";
import { IconButton, Tooltip } from "@mui/material";
import { StarBorderRounded, StarRounded } from "@mui/icons-material";
import { useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { readFavorites, toggleFavorite } from "../utils/favorites";

/** Use targetId as the id of the destination section's outer container. */
export function FavoriteAction({ title, targetId }: { title: string; targetId: string }) {
  const { user } = useAuth();
  const location = useLocation();
  const id = "card:" + location.pathname + ":" + targetId;
  const [selected, setSelected] = useState(false);

  useEffect(() => {
    const refresh = () => setSelected(user?.id != null && readFavorites(user.id).some((favorite) => favorite.id === id));
    refresh();
    window.addEventListener("techlead-favorites-changed", refresh);
    return () => window.removeEventListener("techlead-favorites-changed", refresh);
  }, [user?.id, id]);

  if (user?.id == null) return null;
  return (
    <Tooltip title={selected ? "Remover dos favoritos" : "Favoritar card"}>
      <IconButton
        size="small"
        aria-label={selected ? `Remover ${title} dos favoritos` : `Favoritar ${title}`}
        onClick={(event) => {
          event.stopPropagation();
          toggleFavorite(user.id, { id, label: title, path: location.pathname + "#" + encodeURIComponent(targetId), kind: "card" });
        }}
        sx={{ color: selected ? "warning.main" : "text.secondary" }}
      >
        {selected ? <StarRounded fontSize="small" /> : <StarBorderRounded fontSize="small" />}
      </IconButton>
    </Tooltip>
  );
}
