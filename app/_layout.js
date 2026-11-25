
 import React, { useEffect, useState } from 'react';
 import { Stack } from 'expo-router';
 import { View } from 'react-native';
 import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
 import * as SplashScreen from 'expo-splash-screen';

 import { AuthProvider } from '../src/core/auth/index';
 import { SapEmployeeProvider } from '../src/apps/rrhh/context/SapEmployeeContext';
 import { OrdenesTecnicoProvider } from '../src/apps/mantenimiento/context/OrdenesTecnicoContext';
 import { UbicacionProvider } from '../src/apps/mantenimiento/context/UbicacionContext';
 import { DrawerProvider } from '../src/core/navigation/DrawerContext';
 import SideDrawer from '../src/components/SideDrawer';
 import { OfflineProvider } from '../src/apps/mantenimiento/offline/OfflineProvider';
 import AnimatedSplashVideo from '../src/components/AnimatedSplashVideo';
 import RHOfflineSyncAgent from '../src/apps/rrhh/components/RHOfflineSyncAgent';
 import RHDelaysPreloadAgent from '../src/apps/rrhh/components/RHDelaysPreloadAgent';
 import RHReminderAgent from '../src/apps/rrhh/components/RHReminderAgent';
import { SapModuleAccessProvider, useSapModuleAccess } from "../src/shell/modules/SapModuleAccessContext";

 SplashScreen.preventAutoHideAsync();

 function AuthorizedRHAgents() {
  const { loading, moduleCodes } = useSapModuleAccess();
  if (loading || !moduleCodes.includes("Z002")) return null;
  return <>
    <RHOfflineSyncAgent />
    <RHDelaysPreloadAgent />
    <RHReminderAgent />
  </>;
}

export default function RootLayout() {
   const [appReady, setAppReady] = useState(false);
   const [showAnimatedSplash, setShowAnimatedSplash] = useState(true);

   useEffect(() => {
     async function prepareApp() {
       try {
         await new Promise(resolve => setTimeout(resolve, 800));
       } catch (error) {
         console.log('Error preparando la app:', error);
       } finally {
         setAppReady(true);
         await SplashScreen.hideAsync();
       }
     }
     prepareApp();
   }, []);

   if (!appReady || showAnimatedSplash) {
     return <AnimatedSplashVideo onFinish={() => setShowAnimatedSplash(false)}/>;
   }
   return <SafeAreaProvider>
     <OfflineProvider>
       <AuthProvider>
         <SapEmployeeProvider>
          <SapModuleAccessProvider>

            <AuthorizedRHAgents />
           <OrdenesTecnicoProvider>
             <UbicacionProvider>
               <DrawerProvider>
                 <SafeAreaView style={{ flex: 1, backgroundColor: '#fff' }} edges={['top', 'bottom']}>
                   <View style={{ flex: 1 }}>
                     <Stack screenOptions={{ headerShown: false }}/>
                     <SideDrawer/>
                   </View>
                 </SafeAreaView>
               </DrawerProvider>
             </UbicacionProvider>
           </OrdenesTecnicoProvider>
                   </SapModuleAccessProvider>
        </SapEmployeeProvider>
       </AuthProvider>
     </OfflineProvider>
   </SafeAreaProvider>;
 }
