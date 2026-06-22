import React from "react";
import { View, Text, StyleSheet } from "react-native";

export default function HomeConductor() {
    return (
        <View style={styles.mainContainer}>
            <Text style={styles.text}>Bienvenido al Home del Conductor</Text>
        </View>
    );
}

const styles = StyleSheet.create({
    mainContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#F9F9F9' },
    text: { fontSize: 24, fontWeight: 'bold', color: '#333' },
});