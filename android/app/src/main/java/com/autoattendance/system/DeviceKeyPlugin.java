package com.autoattendance.system;

import android.content.Context;
import android.content.SharedPreferences;
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

    private static final String PREFS_NAME = "autoattendance_device";
    private static final String PREF_DEVICE_ID = "device_id";

    /**
     * Returns the Android Keystore key and device ID already registered
     * on this installation, or creates them if this is the first use.
     */
    @RequiresApi(api = Build.VERSION_CODES.M)
    @PluginMethod
    public void generate(PluginCall call) {
        try {
            Context context = getContext();

            if (context == null) {
                call.reject("Android context is not available");
                return;
            }

            SharedPreferences prefs = context.getSharedPreferences(
                    PREFS_NAME,
                    Context.MODE_PRIVATE
            );

            String existingDeviceId = prefs.getString(PREF_DEVICE_ID, null);

            KeyStore keyStore = KeyStore.getInstance(KEYSTORE);
            keyStore.load(null);

            /*
             * CASE 1:
             * We already have a saved device ID.
             *
             * Check whether the corresponding Android Keystore key
             * still exists. If it does, reuse it.
             */
            if (existingDeviceId != null && !existingDeviceId.trim().isEmpty()) {

                String existingAlias = ALIAS_PREFIX + existingDeviceId;

                if (keyStore.containsAlias(existingAlias)) {

                    java.security.cert.Certificate certificate =
                            keyStore.getCertificate(existingAlias);

                    if (certificate != null) {

                        String publicKey = Base64.encodeToString(
                                certificate.getPublicKey().getEncoded(),
                                Base64.NO_WRAP
                        );

                        JSObject result = new JSObject();

                        result.put("deviceId", existingDeviceId);
                        result.put("publicKey", publicKey);
                        result.put(
                                "deviceName",
                                Build.MANUFACTURER + " " + Build.MODEL
                        );
                        result.put("platform", "android");
                        result.put("existing", true);

                        call.resolve(result);
                        return;
                    }
                }

                /*
                 * The SharedPreferences entry exists, but the Keystore
                 * key is gone.
                 *
                 * This normally means the app was uninstalled/reinstalled
                 * or the secure key was otherwise removed.
                 *
                 * We must NOT pretend this is the old device.
                 */
                prefs.edit()
                        .remove(PREF_DEVICE_ID)
                        .apply();
            }

            /*
             * CASE 2:
             * No usable device identity exists.
             *
             * Generate a new device ID and a new Android Keystore key.
             */
            String deviceId = UUID.randomUUID().toString();
            String alias = ALIAS_PREFIX + deviceId;

            KeyPairGenerator generator = KeyPairGenerator.getInstance(
                    KeyProperties.KEY_ALGORITHM_EC,
                    KEYSTORE
            );

            KeyGenParameterSpec spec = new KeyGenParameterSpec.Builder(
                    alias,
                    KeyProperties.PURPOSE_SIGN |
                            KeyProperties.PURPOSE_VERIFY
            )
                    .setAlgorithmParameterSpec(
                            new ECGenParameterSpec("secp256r1")
                    )
                    .setDigests(KeyProperties.DIGEST_SHA256)
                    .setUserAuthenticationRequired(false)
                    .build();

            generator.initialize(spec);

            KeyPair keyPair = generator.generateKeyPair();

            String publicKey = Base64.encodeToString(
                    keyPair.getPublic().getEncoded(),
                    Base64.NO_WRAP
            );

            /*
             * Save the device ID locally.
             *
             * The private key itself remains safely inside
             * Android Keystore and is never exported.
             */
            prefs.edit()
                    .putString(PREF_DEVICE_ID, deviceId)
                    .apply();

            JSObject result = new JSObject();

            result.put("deviceId", deviceId);
            result.put("publicKey", publicKey);
            result.put(
                    "deviceName",
                    Build.MANUFACTURER + " " + Build.MODEL
            );
            result.put("platform", "android");
            result.put("existing", false);

            call.resolve(result);

        } catch (Exception e) {
            call.reject(
                    "Could not generate or load device key: "
                            + e.getMessage(),
                    e
            );
        }
    }

    /**
     * Signs a server challenge using the private key stored in
     * Android Keystore.
     */
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
                call.reject(
                        "Registered device key was not found on this phone"
                );
                return;
            }

            PrivateKey privateKey =
                    (PrivateKey) keyStore.getKey(alias, null);

            if (privateKey == null) {
                call.reject("Private device key is not available");
                return;
            }

            Signature signature =
                    Signature.getInstance("SHA256withECDSA");

            signature.initSign(privateKey);

            signature.update(
                    challenge.getBytes(StandardCharsets.UTF_8)
            );

            String signedChallenge =
                    Base64.encodeToString(
                            signature.sign(),
                            Base64.NO_WRAP
                    );

            JSObject result = new JSObject();

            result.put("signature", signedChallenge);
            result.put("algorithm", "SHA256withECDSA");

            call.resolve(result);

        } catch (Exception e) {

            call.reject(
                    "Could not sign challenge: "
                            + e.getMessage(),
                    e
            );
        }
    }

    /**
     * Deletes the device's local Keystore key and local device ID.
     *
     * This should only be called when intentionally unregistering
     * the device.
     */
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

            KeyStore keyStore =
                    KeyStore.getInstance(KEYSTORE);

            keyStore.load(null);

            if (keyStore.containsAlias(alias)) {
                keyStore.deleteEntry(alias);
            }

            Context context = getContext();

            if (context != null) {

                SharedPreferences prefs =
                        context.getSharedPreferences(
                                PREFS_NAME,
                                Context.MODE_PRIVATE
                        );

                String savedDeviceId =
                        prefs.getString(
                                PREF_DEVICE_ID,
                                null
                        );

                if (deviceId.equals(savedDeviceId)) {

                    prefs.edit()
                            .remove(PREF_DEVICE_ID)
                            .apply();
                }
            }

            call.resolve();

        } catch (Exception e) {

            call.reject(
                    "Could not delete device key: "
                            + e.getMessage(),
                    e
            );
        }
    }
}