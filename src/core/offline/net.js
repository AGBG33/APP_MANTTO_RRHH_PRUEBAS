import NetInfo from "@react-native-community/netinfo";

export async function isOnline() {
  const st = await NetInfo.fetch();

  // ✅ Online si está conectado y reachability NO es false (true o null)
  return !!st.isConnected && st.isInternetReachable !== false;
}

export function subscribeOnline(cb) {
  return NetInfo.addEventListener((st) => {
    const online = !!st.isConnected && st.isInternetReachable !== false;
    cb(online);
  });
}
