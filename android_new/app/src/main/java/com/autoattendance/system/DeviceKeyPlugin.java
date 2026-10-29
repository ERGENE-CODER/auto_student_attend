package com.autoattendance.system;

import android.os.Build;
import android.util.Base64;

import androidx.annotation.RequiresApi;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.nio.charset.StandardCharsets;
import java.security.KeyPair;
import java.security.KeyPairGenerator;
import java.security.KeyStore;
import java.security.PrivateKey;
import java.security.Signature;
import java.security.spec.ECGenParameterSpec;
import java.util.UUID;

import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;

@CapacitorPlugin(name = "DeviceKey")
public class DeviceKeyPlugin extends Plugin {

    private static final String KEYSTORE = "AndroidKeyStore";
    private static final String ALIAS_PREFIX = "autoattendance_device_";

    @RequiresApi(api = Build.VERSION_CODES.M)
    @PluginMethod
    public void generate(PluginCall call) {
        try {
            String deviceId = UUID.randomUUID().toString();
            String alias = ALIAS_PREFIX + deviceId;

            KeyPairGenerator generator = KeyPairGenerator.getInstance(
                    KeyProperties.KEY_ALGORITHM_EC, KEYSTORE);

            KeyGenParameterSpec spec = new KeyGenParameterSpec.Builder(
                    alias,
                    KeyProperties.PURPOSE_SIGN | KeyProperties.PURPOSE_VERIFY)
                    .setAlgorithmParameterSpec(new ECGenParameterSpec("secp256r1"))
                    .setDigests(KeyProperties.DIGEST_SHA256)
                    .setUserAuthenticationRequired(false)
                    .build();

            generator.initialize(spec);
            KeyPair keyPair = generator.generateKeyPair();

            String publicKey = Base64.encodeToString(
                    keyPair.getPublic().getEncoded(), Base64.NO_WRAP);

            JSObject result = new JSObject();
            result.put("deviceId", deviceId);
            result.put("publicKey", publicKey);
            result.put("deviceName", Build.MANUFACTURER + " " + Build.MODEL);
            result.put("platform", "android");

            call.resolve(result);
        } catch (Exception e) {
            call.reject("Could not generate device key: " + e.getMessage(), e);
        }
    }

    @RequiresApi(api = Build.VERSION_CODES.M)
    @PluginMethod
    public void sign(PluginCall call) {
        String deviceId = call.getString("deviceId");
        String challenge = call.getString("challenge");

        if (deviceId == null || deviceId.trim().isEmpty()) {
            call.reject("deviceId is required");
            return;
        }
        if (challenge == null || challenge.isEmpty()) {
            call.reject("challenge is required");
            return;
        }

        try {
            String alias = ALIAS_PREFIX + deviceId;
            KeyStore keyStore = KeyStore.getInstance(KEYSTORE);
            keyStore.load(null);

            if (!keyStore.containsAlias(alias)) {
                call.reject("Registered device key was not found on this phone");
                return;
            }

            PrivateKey privateKey = (PrivateKey) keyStore.getKey(alias, null);
            Signature signature = Signature.getInstance("SHA256withECDSA");
            signature.initSign(privateKey);
            signature.update(challenge.getBytes(StandardCharsets.UTF_8));

            String signedChallenge = Base64.encodeToString(
                    signature.sign(), Base64.NO_WRAP);

            JSObject result = new JSObject();
            result.put("signature", signedChallenge);
            result.put("algorithm", "SHA256withECDSA");
            call.resolve(result);
        } catch (Exception e) {
            call.reject("Could not sign challenge: " + e.getMessage(), e);
        }
    }

    @RequiresApi(api = Build.VERSION_CODES.M)
    @PluginMethod
    public void delete(PluginCall call) {
        String deviceId = call.getString("deviceId");

        if (deviceId == null || deviceId.trim().isEmpty()) {
            call.reject("deviceId is required");
            return;
        }

        try {
            String alias = ALIAS_PREFIX + deviceId;
            KeyStore keyStore = KeyStore.getInstance(KEYSTORE);
            keyStore.load(null);
            if (keyStore.containsAlias(alias)) {
                keyStore.deleteEntry(alias);
            }
            call.resolve();
        } catch (Exception e) {
            call.reject("Could not delete device key: " + e.getMessage(), e);
        }
    }
}
