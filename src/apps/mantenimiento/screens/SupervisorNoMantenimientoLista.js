// app/supervisor/no_mantenimiento/index.js
import React, { useEffect, useState, useCallback, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  RefreshControl,
  Alert,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, router } from "expo-router";

import Header from "../../../components/Header";
import { fetchOrdenesSupervisor } from "../services/ordenesSupervisor";
import { isOnline } from "../../../core/offline/net";
import { useAuth } from "../../../core/auth/index";

const COLORS = {
  pageBg: "#F4F6F9",
  cardBg: "#FFFFFF",
  border: "#E4E9F0",
  title: "#0B1F3B",
  text: "#52616B",
  accent: "#0A6ED1",
};

const ESTATUS_CARTA_NO_MANTTO = "0600";
const ESTATUS_CARTA_NO_MANTTO_LABEL = "Carta No Mantto";
const MESES_CARTA=["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];
const mesActualCarta=()=>{const d=new Date();return {year:d.getFullYear(),month:d.getMonth()}};
const moverMesCarta=(p,n)=>{const d=new Date(p.year,p.month+n,1);return {year:d.getFullYear(),month:d.getMonth()}};
const rangoMesCarta=(p)=>{
  const ymd=(day)=>[p.year,String(p.month+1).padStart(2,"0"),String(day).padStart(2,"0")].join("-");
  return {desde:ymd(1),hasta:ymd(new Date(p.year,p.month+1,0).getDate())};
};

const safeStr = (v) => (v == null ? "" : String(v));

const parseSapDate = (v) => {
  if (v == null || v === "") return null;
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v;
  if (typeof v === "number") return Number.isFinite(v) ? new Date(v) : null;
  const s=String(v).trim();
  const match=s.match(/\/Date\((-?\d+)(?:[+-]\d{4})?\)\//);
  if (match) return new Date(Number(match[1]));
  if (/^\d{8}$/.test(s)) return new Date(Number(s.slice(0,4)),Number(s.slice(4,6))-1,Number(s.slice(6,8)));
  const d=new Date(s);return Number.isNaN(d.getTime()) ? null : d;
};

function normalizeCode(code) {
  const s = safeStr(code).trim();
  if (!s) return "";

  const n = parseInt(s, 10);
  if (Number.isNaN(n)) return s;

  return String(n).padStart(4, "0");
}

function extractStatusCodes(userstatusRaw) {
  const s = safeStr(userstatusRaw).trim();
  if (!s) return [];

  const matches = s.match(/\d{1,4}/g) || [];

  const codes = matches
    .map((x) => normalizeCode(x))
    .filter((x) => /^\d{4}$/.test(x));

  return Array.from(new Set(codes));
}

// Nueva regla:
// Carta No Mantto únicamente se identifica con 0600.
function isCartaNoManttoByUserstatus(userstatusRaw, estatusCodeRaw) {
  const codes = extractStatusCodes(userstatusRaw);
  const apiCode = normalizeCode(estatusCodeRaw);

  return (
    codes.includes(ESTATUS_CARTA_NO_MANTTO) ||
    apiCode === ESTATUS_CARTA_NO_MANTTO
  );
}

function formatDateTime(value) {
  const d = parseSapDate(value);
  if (!d) return "—";

  return d.toLocaleString();
}

export default function NoMantenimientoIndex() {
  const { user } = useAuth();

  const correo = useMemo(() => {
    return safeStr(
      user?.email || user?.correo || user?.upn || user?.username,
    ).trim();
  }, [user]);

  const [loading, setLoading] = useState(true);
  const [allRows,setAllRows]=useState([]);
  const [periodo,setPeriodo]=useState(mesActualCarta);
  const [offline,setOffline]=useState(false);
  const [errorMessage,setErrorMessage]=useState("");
  const [q, setQ] = useState("");
  const [refreshing, setRefreshing] = useState(false);

  const params = useLocalSearchParams();
  const { refresh } = params;

  // La busqueda de texto NO dispara peticiones de red.
  const fetchLista = useCallback(async () => {
    if(!correo){setAllRows([]);setErrorMessage("No se detecto el correo del usuario.");setLoading(false);return;}
    setLoading(true);setErrorMessage("");
    try {
      const {desde,hasta}=rangoMesCarta(periodo);
      const online=await isOnline();setOffline(!online);
      const response=await fetchOrdenesSupervisor(desde,hasta,"range");
      const todas=Array.isArray(response) ? response : Array.isArray(response?.d?.results) ? response.d.results : Array.isArray(response?.results) ? response.results : [];
      const cartas=todas.filter(it=>isCartaNoManttoByUserstatus(
        it?.userstatus??it?.Userstatus??it?.UserStatus,
        it?.estatus_code??it?.EstatusCode??it?.StatusCode??it?.Status,
      ));
      setAllRows(cartas);
      console.log("[CARTA_NO_MANTTO] Mes",{desde,hasta,total:todas.length,cartas:cartas.length});
    }catch(error){
      console.warn("[CARTA_NO_MANTTO] Error",error?.message||error);
      setErrorMessage("No fue posible cargar este periodo.");setAllRows([]);
    }finally{setLoading(false);}
  },[correo,periodo.year,periodo.month]);

  const rows=useMemo(()=>{
    const qNorm=q.trim().toLowerCase();
    if(!qNorm)return allRows;
    return allRows.filter(it=>[
      it?.orderid,it?.Orderid,it?.OrderId,it?.equipment,it?.Equipment,
      it?.nombre_orden,it?.ShortText,it?.Description,ESTATUS_CARTA_NO_MANTTO_LABEL,
    ].map(safeStr).join(" ").toLowerCase().includes(qNorm));
  },[allRows,q]);

  useEffect(() => {
    fetchLista();
  }, [fetchLista, refresh]);

  const onPullRefresh = async () => {
    try {
      setRefreshing(true);
      await fetchLista();
    } finally {
      setRefreshing(false);
    }
  };

  const openDetalle = (item) => {
    const orderId = safeStr(
      item?.orderid || item?.Orderid || item?.OrderId || item?.OrderID,
    ).trim();

    if (!orderId) {
      Alert.alert("Error", "No se pudo determinar la orden.");
      return;
    }

    router.push({
      pathname: "/supervisor/no_mantenimiento/detalles",
      params: {
        id: orderId,
      },
    });
  };

  const renderItem = ({ item }) => {
    const orderId = safeStr(item?.orderid || item?.Orderid || item?.OrderId || item?.OrderID);
    const startDate = formatDateTime(item?.startdate ?? item?.StartDate);
    const finishDate = formatDateTime(item?.finishdate ?? item?.FinishDate);

    return (
      <TouchableOpacity
        style={styles.card}
        onPress={() => openDetalle(item)}
        activeOpacity={0.75}
      >
        <View style={styles.rowBetween}>
          <Text style={styles.title}>Orden {orderId || "—"}</Text>

          <View style={[styles.pill, styles.pillPending]}>
            <Text style={styles.pillText}>{ESTATUS_CARTA_NO_MANTTO_LABEL}</Text>
          </View>
        </View>

        <Text style={styles.line}>
          <Text style={styles.label}>Equipo: </Text>
          {safeStr(item?.equipment || item?.Equipment || item?.Equipo || "—")}
        </Text>

        <Text style={styles.line}>
          <Text style={styles.label}>Texto: </Text>
          {safeStr(
            item?.nombre_orden || item?.ShortText || item?.Description || item?.Descripcion || "—",
          )}
        </Text>

        <Text style={styles.line}>
          <Text style={styles.label}>Estatus: </Text>
          {ESTATUS_CARTA_NO_MANTTO_LABEL}
        </Text>

        <Text style={[styles.line, { marginTop: 6, fontSize: 12 }]}>
          <Text style={styles.label}>Inicio: </Text>
          {startDate}
          {"  ·  "}
          <Text style={styles.label}>Fin: </Text>
          {finishDate}
        </Text>

        <Text style={[styles.line, { marginTop: 6, fontSize: 12 }]}>
          <Text style={styles.label}>Supervisor: </Text>
          {correo || "—"}
        </Text>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      <Header title="Carta No Mantto" />

      <View style={styles.content}>
        <View style={styles.searchBox}>
          <Ionicons
            name="search"
            size={18}
            color={COLORS.text}
            style={{ marginRight: 6 }}
          />

          <TextInput
            value={q}
            onChangeText={setQ}
            placeholder="Buscar por orden, equipo o texto..."
            placeholderTextColor="#8A96A3"
            style={styles.searchInput}
            returnKeyType="search"
            autoCapitalize="none"
          />

          <TouchableOpacity
            onPress={onPullRefresh}
            style={styles.searchBtn}
            disabled={!correo}
            activeOpacity={0.85}
          >
            <Ionicons name="refresh" size={18} color="#FFF" />
          </TouchableOpacity>
        </View>

        <View style={{ flexDirection:"row",alignItems:"center",justifyContent:"space-between",paddingHorizontal:8,paddingVertical:12,marginTop:10,backgroundColor:"#FFFFFF",borderRadius:12,borderWidth:1,borderColor:COLORS.border }}>
          <TouchableOpacity accessibilityLabel="Mes anterior" onPress={()=>setPeriodo(prev=>moverMesCarta(prev,-1))} style={{padding:8}}>
            <Ionicons name="chevron-back" size={23} color={COLORS.accent}/>
          </TouchableOpacity>
          <View style={{alignItems:"center"}}>
            <Text style={{color:COLORS.text,fontSize:11}}>Periodo de órdenes</Text>
            <Text style={{color:COLORS.title,fontWeight:"800"}}>{MESES_CARTA[periodo.month]} {periodo.year}</Text>
          </View>
          <TouchableOpacity accessibilityLabel="Mes siguiente" onPress={()=>setPeriodo(prev=>moverMesCarta(prev,1))} style={{padding:8}}>
            <Ionicons name="chevron-forward" size={23} color={COLORS.accent}/>
          </TouchableOpacity>
        </View>
        <View style={{flexDirection:"row",justifyContent:"space-between",paddingVertical:9}}>
          <Text style={{color:COLORS.text}}>{allRows.length} cartas{q.trim() ? " · " + rows.length + " coincidencias" : ""}</Text>
          <TouchableOpacity onPress={()=>setPeriodo(mesActualCarta())}>
            <Text style={{color:COLORS.accent,fontWeight:"700"}}>Mes actual</Text>
          </TouchableOpacity>
        </View>
        {offline ? <Text style={{color:COLORS.text,paddingBottom:8}}>Sin conexión: datos guardados del mes, si existen.</Text> : null}
        {errorMessage ? <Text style={{color:"#C0392B",paddingBottom:8}}>{errorMessage}</Text> : null}

        {!correo ? (
          <Text style={styles.emptyText}>
            No se detectó el correo del usuario loggeado.
          </Text>
        ) : loading ? (
          <View style={styles.loadingBox}>
            <ActivityIndicator size="large" color={COLORS.accent} />
            <Text style={{ marginTop: 8, color: COLORS.text }}>
              Cargando…
            </Text>
          </View>
        ) : (
          <FlatList
            data={rows}
            keyExtractor={(it, idx) =>
              safeStr(it?.orderid || it?.Orderid || it?.OrderId || it?.OrderID || idx)
            }
            renderItem={renderItem}
            contentContainerStyle={{ paddingBottom: 90 }}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={onPullRefresh}
              />
            }
            ListEmptyComponent={
              <Text style={styles.emptyText}>
                No hay órdenes con estatus Carta No Mantto.
              </Text>
            }
          />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.pageBg,
  },

  content: {
    flex: 1,
    padding: 14,
  },

  searchBox: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFF",
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 16,
    paddingHorizontal: 10,
    paddingVertical: 10,
    marginBottom: 12,
  },

  searchInput: {
    flex: 1,
    color: COLORS.title,
    fontSize: 13,
  },

  searchBtn: {
    backgroundColor: COLORS.accent,
    padding: 8,
    borderRadius: 12,
    marginLeft: 8,
  },

  loadingBox: {
    paddingTop: 24,
    alignItems: "center",
  },

  emptyText: {
    color: COLORS.text,
    textAlign: "center",
    marginTop: 20,
  },

  card: {
    backgroundColor: COLORS.cardBg,
    borderRadius: 18,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
  },

  rowBetween: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },

  title: {
    fontSize: 15,
    fontWeight: "900",
    color: COLORS.title,
    flex: 1,
    paddingRight: 8,
  },

  line: {
    marginTop: 4,
    color: COLORS.text,
    fontSize: 13,
  },

  label: {
    fontWeight: "900",
    color: COLORS.title,
  },

  pill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },

  pillPending: {
    backgroundColor: "#FFF3CD",
  },

  pillText: {
    fontSize: 11,
    fontWeight: "900",
    color: COLORS.title,
  },
});