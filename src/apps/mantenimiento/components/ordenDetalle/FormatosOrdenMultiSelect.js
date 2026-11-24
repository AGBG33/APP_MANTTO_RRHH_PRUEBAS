import React, { useMemo, useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet, Alert } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";

const FORMATOS_ORDEN = [
  { id:"mantto-cables", nombre:"Mantenimiento de cables", descripcion:"Formato de mantenimiento de cables", ruta:"/tecnico/ordenes/[orderid]/mantto-cables", grupo:"Mantenimiento", icon:"construct-outline" },
  { id:"mantto-freno-em-eh", nombre:"Mantenimiento de freno EM, EH y otros", descripcion:"Formato de mantenimiento de freno para equipos EM y EH", ruta:"/tecnico/ordenes/[orderid]/mantto-freno-em-eh", grupo:"Mantenimiento", icon:"construct-outline" },
  { id:"mantto-freno-pm", nombre:"Mantenimiento de freno PM", descripcion:"Formato de mantenimiento de freno para tipos PM", ruta:"/tecnico/ordenes/[orderid]/mantto-freno-pm", grupo:"Mantenimiento", icon:"construct-outline" },
  { id:"mantto-freno-pm-pmf", nombre:"Mantenimiento de freno PM/PMF", descripcion:"Formato de mantenimiento de freno para tipos PM y PMF", ruta:"/tecnico/ordenes/[orderid]/mantto-freno-pm-pmf", grupo:"Mantenimiento", icon:"construct-outline" },
  { id:"reporte-emergencia", nombre:"Reporte de emergencia", descripcion:"Formato de emergencia", ruta:"/tecnico/ordenes/[orderid]/reporte-emergencia", grupo:"Reportes", icon:"warning-outline" },
  { id:"reporte-pendientes", nombre:"Reporte de pendientes", descripcion:"Formato de reporte de pendientes", ruta:"/tecnico/ordenes/[orderid]/reporte-pendientes", grupo:"Reportes", icon:"clipboard-outline" },
  { id:"terminacion-conformidad", nombre:"Reporte de terminación y conformidad", descripcion:"Reporte de terminación y conformidad de servicios realizados", ruta:"/tecnico/ordenes/[orderid]/terminacion-conformidad", grupo:"Reportes", icon:"checkmark-done-outline" },
  { id:"reporte-averia-mantenimiento", nombre:"Avería en mantenimiento", descripcion:"Reporte de avería en mantenimiento", ruta:"/tecnico/ordenes/[orderid]/reporte-averia-mantenimiento", grupo:"Reportes", icon:"newspaper-outline" },
  { id:"autorizacion-gastos-error-humano", nombre:"Formato de autorización de gastos", descripcion:"Formato de autorización de gastos por error humano, caso fortuito o vicio oculto", ruta:"/tecnico/ordenes/[orderid]/autorizacion-gastos-error-humano", grupo:"Administrativos", icon:"cash-outline" },
  { id:"requisicion-materiales", nombre:"Requisición de materiales", descripcion:"Formato de requisición de materiales", ruta:"/tecnico/ordenes/[orderid]/requisicion-materiales", grupo:"Administrativos", icon:"cube-outline" },
  { id:"solicitud-prestamo-refacciones", nombre:"Préstamo de refacciones", descripcion:"Solicitud de préstamo de refacciones", ruta:"/tecnico/ordenes/[orderid]/solicitud-prestamo-refacciones", grupo:"Administrativos", icon:"settings-outline" },
  { id:"solicitud-cotizacion", nombre:"Solicitud de cotización", descripcion:"Solicitud de cotización", ruta:"/tecnico/ordenes/[orderid]/solicitud-cotizacion", grupo:"Administrativos", icon:"receipt-outline" },
  { id:"inspeccion-anual-mantenimiento", nombre:"Inspección anual de mantenimiento", descripcion:"Inspección anual", ruta:"/tecnico/ordenes/[orderid]/inspeccion-anual-mantenimiento", grupo:"Administrativos", icon:"eye-outline" },
];

export default function FormatosOrdenMultiSelect({ FIORI, orderid }) {
  const [open, setOpen] = useState(false);

  const grupos = useMemo(() => {
    const map = new Map();
    FORMATOS_ORDEN.forEach((formato) => {
      const grupo = formato.grupo || "Otros";
      if (!map.has(grupo)) map.set(grupo, []);
      map.get(grupo).push(formato);
    });
    return Array.from(map.entries()).map(([grupo, items]) => ({ grupo, items }));
  }, []);

  const abrirFormato = (formato) => {
    const orderIdFinal = String(orderid || "").trim();
    if (!orderIdFinal) {
      Alert.alert("Error", "No se encontró el número de orden.");
      return;
    }
    setOpen(false);
    router.push({ pathname: formato.ruta, params: { orderid: orderIdFinal } });
  };
 return null;

  /*
  return (
    <View style={local.card}>
      <TouchableOpacity
        activeOpacity={0.9}
        onPress={() => setOpen((v) => !v)}
        style={local.header}
      >
        <View style={local.headerIcon}>
          <Ionicons
            name="folder-open-outline"
            size={18}
            color={FIORI?.brand || "#0A6ED1"}
          />
        </View>

        <Text style={local.title}>Formatos de la orden</Text>

        <View style={local.countBadge}>
          <Text style={local.countText}>{FORMATOS_ORDEN.length}</Text>
        </View>

        <Ionicons
          name={open ? "chevron-up-outline" : "chevron-down-outline"}
          size={18}
          color={FIORI?.textMuted || "#63718B"}
        />
      </TouchableOpacity>

      {open && (
        <View style={local.dropdown}>
          {grupos.map(({ grupo, items }) => (
            <View key={grupo} style={local.groupBlock}>
              <Text style={local.groupTitle}>{grupo}</Text>

              <View style={local.list}>
                {items.map((formato) => (
                  <TouchableOpacity
                    key={String(formato.id)}
                    activeOpacity={0.88}
                    style={local.item}
                    onPress={() => abrirFormato(formato)}
                  >
                    <View style={local.itemIcon}>
                      <Ionicons
                        name={formato.icon || "document-text-outline"}
                        size={17}
                        color={FIORI?.brand || "#0A6ED1"}
                      />
                    </View>

                    <View style={local.itemBody}>
                      <Text style={local.itemTitle} numberOfLines={2}>
                        {formato.nombre}
                      </Text>
                      {!!formato.descripcion && (
                        <Text style={local.itemDesc} numberOfLines={1}>
                          {formato.descripcion}
                        </Text>
                      )}
                    </View>

                    <Ionicons
                      name="chevron-forward-outline"
                      size={17}
                      color={FIORI?.brand || "#0A6ED1"}
                    />
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          ))}
        </View>
      )}
    </View>
  );
  */
}

const local = StyleSheet.create({
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#DDE6F2",
    paddingHorizontal: 10,
    paddingVertical: 9,
    marginBottom: 9,
  },
  header: {
    minHeight: 38,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  headerIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: "#EAF4FF",
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    flex: 1,
    fontSize: 13,
    fontWeight: "900",
    color: "#0B1F3B",
  },
  countBadge: {
    minWidth: 24,
    height: 22,
    paddingHorizontal: 6,
    borderRadius: 999,
    backgroundColor: "#F3F8FF",
    alignItems: "center",
    justifyContent: "center",
  },
  countText: {
    fontSize: 10,
    fontWeight: "900",
    color: "#0A6ED1",
  },
  dropdown: {
    marginTop: 9,
    paddingTop: 9,
    borderTopWidth: 1,
    borderTopColor: "#E8EEF7",
    gap: 11,
  },
  groupBlock: { gap: 6 },
  groupTitle: {
    fontSize: 10,
    fontWeight: "900",
    color: "#63718B",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    paddingHorizontal: 2,
  },
  list: { gap: 6 },
  item: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderWidth: 1,
    borderColor: "#E8EEF7",
    backgroundColor: "#F7F9FC",
    borderRadius: 11,
    paddingHorizontal: 9,
    paddingVertical: 8,
  },
  itemIcon: {
    width: 31,
    height: 31,
    borderRadius: 9,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E8EEF7",
    alignItems: "center",
    justifyContent: "center",
  },
  itemBody: { flex: 1 },
  itemTitle: {
    fontSize: 12,
    fontWeight: "900",
    color: "#0B1F3B",
  },
  itemDesc: {
    marginTop: 1,
    fontSize: 10,
    lineHeight: 13,
    fontWeight: "700",
    color: "#63718B",
  },
});
