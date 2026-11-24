// app/tecnico/ordenes/[id]/secciones/ListaOperacionesDetalle.js
import React, { useMemo, useState, useEffect } from "react";
import { View, Text, TouchableOpacity, Alert, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";

/* ============================ Helpers ============================ */
function safeStr(v) {
  return String(v ?? "").trim();
}

function normalizeUsr02(op) {
  const v = safeStr(op?.Usr02 ?? op?.usr02);
  return v || "SIN UBICACIÓN";
}

function normalizeActivity(op) {
  return safeStr(op?.activity ?? op?.Activity);
}

function normalizeDescription(op) {
  return safeStr(op?.description ?? op?.Description);
}

function normalizeStandardTextKey(op) {
  return safeStr(op?.standardTextKey ?? op?.StandardTextKey);
}

function normalizeEstatus(op) {
  return safeStr(op?.estatus ?? op?.Estatus ?? "").toLowerCase() || "pendiente";
}

function normalizeCategoria(op) {
  const categoria =
    safeStr(op?.standardTextKey ?? op?.StandardTextKey) ||
    safeStr(op?.categoria ?? op?.Categoria) ||
    safeStr(op?.category ?? op?.Category) ||
    safeStr(op?.controlKey ?? op?.ControlKey) ||
    "SIN CATEGORÍA";

  return categoria.toUpperCase();
}

/*
 * Iconos genéricos por grupo.
 * Si SAP envía otros valores de Usr02, se usa layers-outline como fallback.
 */
/* ============================ Colores categorías ============================ */
const CATEGORY_COLORS = [
  { bg: "#EEF6FF", border: "#B9D9F5", chipBg: "#DCEEFF", text: "#0B4F8A" },
  { bg: "#F1FAF5", border: "#BFE8D0", chipBg: "#DDF5E7", text: "#0B6B3A" },
  { bg: "#FFF8E8", border: "#F2D59A", chipBg: "#FFF0C7", text: "#8A5A00" },
  { bg: "#F7F0FF", border: "#D7C2F0", chipBg: "#EFE1FF", text: "#5A2E91" },
  { bg: "#FFF0F3", border: "#F2B8C6", chipBg: "#FFE0E7", text: "#9A2F4A" },
  { bg: "#EFFBFB", border: "#B7E3E3", chipBg: "#D9F4F4", text: "#0B666A" },
  { bg: "#F4F6FA", border: "#C9D3E3", chipBg: "#E8EDF5", text: "#32445E" },
  { bg: "#FFF4EC", border: "#F1C4A3", chipBg: "#FFE5D3", text: "#8A3F0B" },
];

function hashTextToIndex(text, max) {
  const s = safeStr(text).toUpperCase();
  let hash = 0;

  for (let i = 0; i < s.length; i++) {
    hash = (hash * 31 + s.charCodeAt(i)) >>> 0;
  }

  return hash % max;
}

function getCategoryColor(categoria) {
  return CATEGORY_COLORS[
    hashTextToIndex(categoria || "SIN CATEGORÍA", CATEGORY_COLORS.length)
  ];
}

function opStableId(orderId, op, idx) {
  const existing = safeStr(op?.id);
  if (existing) return existing;

  const activity = normalizeActivity(op);
  const usr02 = normalizeUsr02(op);
  const desc = normalizeDescription(op);
  const stk = normalizeStandardTextKey(op);

  const oid = safeStr(orderId);
  const key = `${oid}-${activity}-${usr02}-${desc}-${stk}-${idx}`.trim();

  return key && key !== "-" ? key : `fallback__${idx}`;
}

function agruparPorUsr02(ops = []) {
  const porGrupo = {};

  for (const op of ops || []) {
    const grp = normalizeUsr02(op);

    if (!porGrupo[grp]) {
      porGrupo[grp] = [];
    }

    porGrupo[grp].push(op);
  }

  const grupos = Object.keys(porGrupo).sort((a, b) => a.localeCompare(b));

  for (const grp of grupos) {
    porGrupo[grp].sort((x, y) => {
      const ax = normalizeActivity(x);
      const ay = normalizeActivity(y);
      return ax.localeCompare(ay);
    });
  }

  return { grupos, porGrupo };
}

/* ============================ Lista agrupada ============================ */
export function ListaOperacionesAgrupadas({
  operaciones = [],
  styles,
  FIORI,

  finalizeMode = false,
  onRequestCancelFinalize,

  checkedMap = {},
  setCheckedMap,

  orderId,
}) {
  const grouped = useMemo(() => agruparPorUsr02(operaciones), [operaciones]);

  const [groupOpen, setGroupOpen] = useState({});

  useEffect(() => {
    const grupos = grouped.grupos || [];

    if (!grupos.length) {
      setGroupOpen({});
      return;
    }

    setGroupOpen((prev) => {
      const next = { ...(prev || {}) };

      for (const g of grupos) {
        if (typeof next[g] === "undefined") {
          next[g] = false;
        }
      }

      for (const key of Object.keys(next)) {
        if (!grupos.includes(key)) {
          delete next[key];
        }
      }

      return next;
    });
  }, [grouped.grupos]);

  if (!grouped.grupos?.length) {
    return (
      <View style={{ paddingVertical: 8 }}>
        <Text style={{ color: FIORI.textMuted }}>
          No hay operaciones para mostrar.
        </Text>
      </View>
    );
  }

  const toggleGroup = (grp) => {
    setGroupOpen((prev) => ({
      ...(prev || {}),
      [grp]: !prev?.[grp],
    }));
  };

  const isOpChecked = (opId) => !!checkedMap?.[opId];

  const setManyChecked = (opIds, value) => {
    setCheckedMap?.((prev) => {
      const next = { ...(prev || {}) };

      for (const id of opIds) {
        if (value) {
          next[id] = true;
        } else {
          delete next[id];
        }
      }

      return next;
    });
  };

  const toggleOpChecked = (opId) => {
    setCheckedMap?.((prev) => {
      const next = { ...(prev || {}) };

      if (next[opId]) {
        delete next[opId];
      } else {
        next[opId] = true;
      }

      return next;
    });
  };

  const confirmCancelFinalize = () => {
    Alert.alert(
      "Cancelar finalización",
      "Esto quitará todos los checks marcados. El cronómetro seguirá normal. ¿Deseas continuar?",
      [
        {
          text: "No",
          style: "cancel",
        },
        {
          text: "Sí, cancelar",
          style: "destructive",
          onPress: () => {
            setCheckedMap?.({});
            onRequestCancelFinalize?.();
          },
        },
      ],
    );
  };

  return (
    <View style={local.wrapper}>
      {/* ==================== Modo finalizar ==================== */}
      {finalizeMode && (
        <View
          style={[
            local.finalizeBanner,
            {
              borderColor: FIORI.borderSoft,
              backgroundColor: FIORI.brandSoft,
            },
          ]}
        >
          <View style={local.finalizeText}>
            <Ionicons
              name="checkbox-outline"
              size={18}
              color={FIORI.brand}
            />

            <Text
              style={{
                fontWeight: "900",
                color: FIORI.text,
                flex: 1,
                fontSize: 12,
              }}
            >
              Modo finalizar: marca las actividades realizadas
            </Text>
          </View>

          <TouchableOpacity
            activeOpacity={0.9}
            onPress={confirmCancelFinalize}
            style={[
              local.cancelBtn,
              {
                borderColor: FIORI.borderSoft,
              },
            ]}
          >
            <Text
              style={{
                fontWeight: "900",
                color: FIORI.err,
                fontSize: 11,
              }}
            >
              Cancelar
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {/* ==================== Grupos ==================== */}
      <View style={local.groups}>
        {grouped.grupos.map((grp) => {
          const isOpen = !!groupOpen?.[grp];
          const opsGroup = grouped.porGrupo?.[grp] || [];

          const opIds = opsGroup.map((op, idx) =>
            opStableId(orderId, op, idx),
          );

          const checkedCount = opIds.filter((id) =>
            isOpChecked(id),
          ).length;

          const allChecked =
            opIds.length > 0 && checkedCount === opIds.length;

          const someChecked =
            checkedCount > 0 && !allChecked;

          const groupCheckIcon = allChecked
            ? "checkbox"
            : someChecked
              ? "remove-circle-outline"
              : "square-outline";

          return (
            <View
              key={grp}
              style={[
                local.groupCard,
                {
                  borderColor: isOpen
                    ? FIORI.brand
                    : FIORI.border,
                  backgroundColor: isOpen
                    ? "#F8FBFF"
                    : FIORI.surface,
                },
              ]}
            >
              {/* Acento lateral */}
              <View
                pointerEvents="none"
                style={[
                  local.leftAccent,
                  {
                    backgroundColor: isOpen
                      ? FIORI.brand
                      : "#B9D9F5",
                  },
                ]}
              />

              {/* Header del grupo */}
              <TouchableOpacity
                activeOpacity={0.88}
                onPress={() => toggleGroup(grp)}
                style={local.groupHeader}
              >
                {/* Nombre y cantidad */}
                <View style={local.groupInfo}>
                  <View style={local.groupTitleRow}>
                    <Text
                      style={[
                        local.groupTitle,
                        {
                          color: isOpen ? FIORI.brand : FIORI.text,
                        },
                      ]}
                      numberOfLines={1}
                    >
                      {grp}
                    </Text>

                    <View
                      style={[
                        local.countBadge,
                        {
                          backgroundColor: isOpen
                            ? FIORI.brand
                            : "#E8F4FF",
                        },
                      ]}
                    >
                      <Text
                        style={[
                          local.countText,
                          {
                            color: isOpen
                              ? "#FFFFFF"
                              : FIORI.brand,
                          },
                        ]}
                      >
                        {opsGroup.length}
                      </Text>
                    </View>
                  </View>

                  <Text
                    style={[
                      local.groupSubtitle,
                      { color: FIORI.textMuted },
                    ]}
                  >
                    {isOpen ? "Ocultar operaciones" : "Ver operaciones"}
                  </Text>
                </View>

                {/* Flecha */}
                <View
                  style={[
                    local.chevronBox,
                    {
                      backgroundColor: isOpen
                        ? FIORI.brandSoft
                        : "#F4F7FB",
                    },
                  ]}
                >
                  <Ionicons
                    name={
                      isOpen
                        ? "chevron-up-outline"
                        : "chevron-down-outline"
                    }
                    size={16}
                    color={
                      isOpen
                        ? FIORI.brand
                        : FIORI.textMuted
                    }
                  />
                </View>
              </TouchableOpacity>

              {/* ==================== Contenido abierto ==================== */}
              {isOpen && (
                <View
                  style={[
                    local.openBody,
                    {
                      borderTopColor: FIORI.borderSoft,
                    },
                  ]}
                >
                  {/* Marcar todo */}
                  {finalizeMode && (
                    <TouchableOpacity
                      activeOpacity={0.9}
                      onPress={() =>
                        setManyChecked(opIds, !allChecked)
                      }
                      style={[
                        local.selectAll,
                        {
                          borderColor: FIORI.borderSoft,
                          backgroundColor: allChecked
                            ? FIORI.brandSoft
                            : FIORI.surface,
                        },
                      ]}
                    >
                      <Ionicons
                        name={groupCheckIcon}
                        size={19}
                        color={
                          allChecked || someChecked
                            ? FIORI.brand
                            : FIORI.textMuted
                        }
                      />

                      <Text
                        style={{
                          fontWeight: "900",
                          color: FIORI.text,
                          fontSize: 11,
                        }}
                      >
                        Marcar todas ({checkedCount}/{opIds.length})
                      </Text>
                    </TouchableOpacity>
                  )}

                  {/* Operaciones */}
                  <View style={local.operationList}>
                    {opsGroup.map((op, idx) => {
                      const realId = opStableId(
                        orderId,
                        op,
                        idx,
                      );

                      const checked = isOpChecked(realId);

                      return (
                        <ItemOperacionDetalle
                          key={`${realId}-${idx}`}
                          op={{
                            ...op,
                            activity: normalizeActivity(op),
                            description: normalizeDescription(op),
                            standardTextKey:
                              normalizeStandardTextKey(op),
                            categoria: normalizeCategoria(op),
                          }}
                          index={idx}
                          styles={styles}
                          FIORI={FIORI}
                          allowChecks={finalizeMode}
                          checked={checked}
                          onToggleCheck={() =>
                            toggleOpChecked(realId)
                          }
                        />
                      );
                    })}
                  </View>
                </View>
              )}
            </View>
          );
        })}
      </View>
    </View>
  );
}

/* ============================ Operación ============================ */
export function ItemOperacionDetalle({
  op,
  index,
  styles,
  FIORI,
  allowChecks = false,
  checked = false,
  onToggleCheck,
}) {
  const est = normalizeEstatus(op);

  const isFinal = est === "finalizada";
  const isProc = est === "en_proceso";
  const isPause = est === "pausada";

  const badgeBg = isFinal
    ? FIORI.brandSoft
    : isProc
      ? "#E8F5FF"
      : isPause
        ? "#FFF4E5"
        : FIORI.surfaceAlt;

  const badgeText = isFinal
    ? "FIN"
    : isProc
      ? "PROC"
      : isPause
        ? "PAUS"
        : "PEND";

  const desc = normalizeDescription(op);
  const stk = normalizeStandardTextKey(op);
  const categoria = normalizeCategoria(op);
  const categoryColor = getCategoryColor(categoria);

  const stkNorm = stk.toLowerCase().trim();

  const act =
    safeStr(op?.activity ?? op?.Activity) || "—";

  const cardBg = checked
    ? FIORI.brandSoft
    : categoryColor.bg;

  const cardBorder = checked
    ? FIORI.brand
    : categoryColor.border;

  return (
    <View
      style={[
        local.operationCard,
        {
          backgroundColor: cardBg,
          borderColor: cardBorder,
          borderWidth: checked ? 1.5 : 1,
        },
      ]}
    >
      <View style={local.operationRow}>
        {/* Check */}
        {allowChecks && (
          <TouchableOpacity
            activeOpacity={0.9}
            onPress={onToggleCheck}
            style={[
              local.checkBox,
              {
                borderColor: checked
                  ? FIORI.brand
                  : categoryColor.border,

                backgroundColor: checked
                  ? FIORI.surface
                  : "rgba(255,255,255,0.65)",
              },
            ]}
          >
            <Ionicons
              name={
                checked
                  ? "checkbox"
                  : "square-outline"
              }
              size={19}
              color={
                checked
                  ? FIORI.brand
                  : FIORI.textMuted
              }
            />
          </TouchableOpacity>
        )}

        {/* Estado */}
        <View
          style={[
            local.statusBadge,
            {
              backgroundColor: badgeBg,
              borderColor: FIORI.borderSoft,
            },
          ]}
        >
          <Text
            style={[
              local.statusText,
              {
                color: FIORI.text,
              },
            ]}
          >
            {badgeText}
          </Text>
        </View>

        {/* Información */}
        <View style={{ flex: 1 }}>
          <Text
            style={[
              local.operationTitle,
              {
                color: FIORI.text,
              },
            ]}
          >
            #{index + 1} · {act}
          </Text>

          {!!desc && (
            <Text
              style={[
                local.operationDesc,
                {
                  color: FIORI.textMuted,
                },
              ]}
              numberOfLines={2}
            >
              {desc}
            </Text>
          )}

          {/* Categoría */}
          <View
            style={[
              local.categoryChip,
              {
                borderColor: categoryColor.border,
                backgroundColor: categoryColor.chipBg,
              },
            ]}
          >
            <Ionicons
              name="pricetag-outline"
              size={11}
              color={categoryColor.text}
            />

            <Text
              numberOfLines={1}
              style={[
                local.categoryText,
                {
                  color: categoryColor.text,
                },
              ]}
            >
              {stkNorm ? stk : categoria}
            </Text>
          </View>
        </View>
      </View>
    </View>
  );
}

/* ============================ Estilos ============================ */
const local = StyleSheet.create({
  wrapper: {
    marginTop: 3,
  },

  groups: {
    gap: 8,
  },

  /* ===== Grupo ===== */
  groupCard: {
    position: "relative",
    borderRadius: 14,
    borderWidth: 1,
    overflow: "hidden",

    // Sombra muy ligera para que destaque sin verse pesada
    shadowColor: "#0B1F3B",
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.05,
    shadowRadius: 4,

    elevation: 1,
  },

  leftAccent: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    width: 4,
    zIndex: 2,
  },

  groupHeader: {
    minHeight: 58,
    paddingLeft: 15,
    paddingRight: 10,
    paddingVertical: 8,

    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },

  groupInfo: {
    flex: 1,
    justifyContent: "center",
  },

  groupTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },

  groupTitle: {
    fontSize: 13.5,
    fontWeight: "900",
    letterSpacing: 0.15,
  },

  groupSubtitle: {
    marginTop: 2,
    fontSize: 9.5,
    fontWeight: "700",
  },

  countBadge: {
    minWidth: 28,
    height: 23,

    paddingHorizontal: 7,

    borderRadius: 999,

    alignItems: "center",
    justifyContent: "center",
  },

  countText: {
    fontWeight: "900",
    fontSize: 10,
  },

  chevronBox: {
    width: 32,
    height: 32,

    borderRadius: 10,

    alignItems: "center",
    justifyContent: "center",
  },

  openBody: {
    paddingHorizontal: 9,
    paddingTop: 8,
    paddingBottom: 9,

    borderTopWidth: 1,

    gap: 7,
  },

  /* ===== Operaciones ===== */
  operationList: {
    gap: 6,
  },

  operationCard: {
    borderRadius: 10,
    padding: 9,
  },

  operationRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
  },

  statusBadge: {
    borderRadius: 999,
    borderWidth: 1,

    paddingHorizontal: 8,
    paddingVertical: 5,

    marginTop: 1,
  },

  statusText: {
    fontSize: 10,
    fontWeight: "900",
  },

  operationTitle: {
    fontSize: 12,
    fontWeight: "900",
  },

  operationDesc: {
    fontSize: 11,
    lineHeight: 15,
    marginTop: 2,
  },

  categoryChip: {
    alignSelf: "flex-start",

    marginTop: 6,

    paddingHorizontal: 8,
    paddingVertical: 4,

    borderRadius: 999,
    borderWidth: 1,

    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },

  categoryText: {
    maxWidth: 220,

    fontWeight: "900",
    fontSize: 10,
  },

  checkBox: {
    width: 28,
    height: 28,

    borderRadius: 8,

    alignItems: "center",
    justifyContent: "center",

    borderWidth: 1,

    marginTop: 1,
  },

  /* ===== Modo finalizar ===== */
  finalizeBanner: {
    marginTop: 4,
    marginBottom: 7,

    padding: 8,

    borderRadius: 11,
    borderWidth: 1,

    flexDirection: "row",
    alignItems: "center",

    gap: 8,
  },

  finalizeText: {
    flex: 1,

    flexDirection: "row",
    alignItems: "center",

    gap: 7,
  },

  cancelBtn: {
    paddingHorizontal: 9,
    paddingVertical: 7,

    borderRadius: 9,
    borderWidth: 1,

    backgroundColor: "#FFECEC",
  },

  selectAll: {
    alignSelf: "flex-start",

    flexDirection: "row",
    alignItems: "center",

    gap: 7,

    paddingHorizontal: 9,
    paddingVertical: 7,

    borderRadius: 9,
    borderWidth: 1,
  },
});

/**
 * Default export requerido porque el archivo está dentro de /app/
 * y Expo Router puede interpretarlo como ruta.
 */
export default function _RouteShim() {
  return null;
}