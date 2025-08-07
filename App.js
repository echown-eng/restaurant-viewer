// App.js — Expo React Native app to import an Excel list of restaurants and show a table + map
// How to run:
// 1) Install Expo CLI if needed: npm i -g expo-cli
// 2) In an empty folder: npx create-expo-app@latest restaurant-viewer --template blank
// 3) Replace the generated App.js with this file's contents
// 4) Install deps:
//    npx expo install expo-document-picker expo-file-system react-native-maps
//    npm i @react-navigation/native @react-navigation/material-top-tabs react-native-tab-view xlsx
//    npx expo install react-native-safe-area-context react-native-screens react-native-gesture-handler
// 5) Start the app: npx expo start (then open on your phone with Expo Go)

import React, { useMemo, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, FlatList, StyleSheet, TextInput, Linking } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import XLSX from 'xlsx';
import MapView, { Marker } from 'react-native-maps';
import { NavigationContainer } from '@react-navigation/native';
import { createMaterialTopTabNavigator } from '@react-navigation/material-top-tabs';

const Tab = createMaterialTopTabNavigator();

// Expected Excel columns (first sheet):
// Name | Address | City | State | Country | Latitude | Longitude | Phone | Website | Cuisine | Notes

function pickAndParseExcel(setData, setError) {
  return async () => {
    try {
      setError(null);
      const res = await DocumentPicker.getDocumentAsync({
        type: [
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'application/vnd.ms-excel',
        ],
        copyToCacheDirectory: true,
        multiple: false,
      });

      if (res.canceled || !res.assets?.length) return;
      const file = res.assets[0];
      const b64 = await FileSystem.readAsStringAsync(file.uri, { encoding: FileSystem.EncodingType.Base64 });

      const wb = XLSX.read(b64, { type: 'base64' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(ws, { defval: '' });

      const cleaned = rows.map((r, idx) => ({
        id: `${idx}-${r.Name || r.name || r.Title || ''}`,
        name: r.Name || r.name || r.Title || 'Unnamed',
        address: r.Address || r.address || '',
        city: r.City || r.city || '',
        state: r.State || r.state || '',
        country: r.Country || r.country || '',
        lat: safeFloat(r.Latitude || r.latitude || r.lat),
        lng: safeFloat(r.Longitude || r.longitude || r.lng),
        phone: r.Phone || r.phone || '',
        website: r.Website || r.website || '',
        cuisine: r.Cuisine || r.cuisine || '',
        notes: r.Notes || r.notes || '',
      }));

      setData(cleaned);
    } catch (e) {
      console.error(e);
      setError('Failed to read that file. Make sure it\'s an .xlsx or .xls with a header row.');
    }
  };
}

const safeFloat = (v) => {
  const n = parseFloat(String(v).replace(',', '.'));
  return Number.isFinite(n) ? n : null;
};

function Header({ onImport, onSearch, search }) {
  return (
    <View style={styles.header}>
      <TouchableOpacity style={styles.button} onPress={onImport}>
        <Text style={styles.buttonText}>Import Excel</Text>
      </TouchableOpacity>
      <TextInput
        style={styles.search}
        placeholder="Search name, city, cuisine…"
        value={search}
        onChangeText={onSearch}
        autoCapitalize="none"
      />
    </View>
  );
}

function TableScreen({ data, onImport, search, setSearch }) {
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return data;
    return data.filter((r) => [r.name, r.city, r.cuisine, r.state, r.country].some(x => (x || '').toLowerCase().includes(q)));
  }, [data, search]);

  const renderItem = ({ item }) => (
    <View style={styles.row}>
      <View style={{ flex: 2 }}>
        <Text style={styles.name}>{item.name}</Text>
        <Text style={styles.sub}>{[item.address, item.city, item.state, item.country].filter(Boolean).join(', ')}</Text>
        {!!item.cuisine && <Text style={styles.sub}>Cuisine: {item.cuisine}</Text>}
        {!!item.notes && <Text style={styles.sub}>Notes: {item.notes}</Text>}
      </View>
      <View style={{ flex: 1, alignItems: 'flex-end', gap: 6 }}>
        {!!item.phone && (
          <TouchableOpacity onPress={() => Linking.openURL(`tel:${item.phone}`)}>
            <Text style={styles.link}>Call</Text>
          </TouchableOpacity>
        )}
        {!!item.website && (
          <TouchableOpacity onPress={() => Linking.openURL(item.website.startsWith('http') ? item.website : `https://${item.website}`)}>
            <Text style={styles.link}>Website</Text>
          </TouchableOpacity>
        )}
        {(item.lat && item.lng) && (
          <TouchableOpacity onPress={() => Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${item.lat},${item.lng}`)}>
            <Text style={styles.link}>Open in Maps</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );

  return (
    <View style={{ flex: 1 }}>
      <Header onImport={onImport} onSearch={setSearch} search={search} />
      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        ItemSeparatorComponent={() => <View style={styles.sep} />}
        ListEmptyComponent={<Text style={styles.empty}>Import an Excel file to get started.</Text>}
        contentContainerStyle={{ paddingBottom: 40 }}
      />
    </View>
  );
}

function MapScreen({ data, onImport, search, setSearch }) {
  const mapRef = useRef(null);

  const geocoded = useMemo(() => data.filter((d) => Number.isFinite(d.lat) && Number.isFinite(d.lng)), [data]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return geocoded;
    return geocoded.filter((r) => [r.name, r.city, r.cuisine, r.state, r.country].some(x => (x || '').toLowerCase().includes(q)));
  }, [geocoded, search]);

  const onMapLayout = () => {
    if (!mapRef.current || filtered.length === 0) return;
    const coords = filtered.map((r) => ({ latitude: r.lat, longitude: r.lng }));
    if (coords.length === 1) {
      mapRef.current.animateCamera({ center: coords[0], zoom: 14 }, { duration: 600 });
    } else {
      mapRef.current.fitToCoordinates(coords, { edgePadding: { top: 60, right: 60, bottom: 60, left: 60 }, animated: true });
    }
  };

  return (
    <View style={{ flex: 1 }}>
      <Header onImport={onImport} onSearch={setSearch} search={search} />
      <MapView
        ref={mapRef}
        style={{ flex: 1 }}
        initialRegion={{ latitude: 37.7749, longitude: -122.4194, latitudeDelta: 0.5, longitudeDelta: 0.5 }}
        onLayout={onMapLayout}
      >
        {filtered.map((r) => (
          <Marker key={r.id} coordinate={{ latitude: r.lat, longitude: r.lng }} title={r.name} description={[r.address, r.city].filter(Boolean).join(', ')} />
        ))}
      </MapView>
      {filtered.length === 0 && (
        <View style={styles.overlay}> 
          <Text style={styles.empty}>No mappable rows. Make sure your sheet has Latitude and Longitude columns.</Text>
        </View>
      )}
    </View>
  );
}

export default function App() {
  const [data, setData] = useState([]);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');

  const handleImport = pickAndParseExcel(setData, setError);

  return (
    <NavigationContainer>
      <View style={{ flex: 1 }}>
        {!!error && (
          <View style={styles.error}><Text style={{ color: '#b00020' }}>{error}</Text></View>
        )}
        <Tab.Navigator>
          <Tab.Screen name="Table">
            {() => <TableScreen data={data} onImport={handleImport} search={search} setSearch={setSearch} />}
          </Tab.Screen>
          <Tab.Screen name="Map">
            {() => <MapScreen data={data} onImport={handleImport} search={search} setSearch={setSearch} />}
          </Tab.Screen>
        </Tab.Navigator>
      </View>
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    gap: 8,
    padding: 12,
    alignItems: 'center',
    backgroundColor: '#f6f6f6',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#ddd',
  },
  button: {
    backgroundColor: '#111827',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
  },
  buttonText: { color: 'white', fontWeight: '600' },
  search: {
    flex: 1,
    backgroundColor: 'white',
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: 14,
    backgroundColor: 'white',
  },
  name: { fontSize: 16, fontWeight: '700', marginBottom: 2 },
  sub: { color: '#444', marginTop: 2 },
  link: { color: '#2563eb', fontWeight: '600' },
  sep: { height: 1, backgroundColor: '#eee' },
  empty: { padding: 20, textAlign: 'center', color: '#666' },
  error: { padding: 10, backgroundColor: '#fdecec' },
  overlay: { position: 'absolute', bottom: 20, left: 20, right: 20, backgroundColor: 'rgba(255,255,255,0.95)', padding: 12, borderRadius: 10 },
});
