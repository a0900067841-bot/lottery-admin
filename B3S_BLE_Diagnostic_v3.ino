#include <Arduino.h>
#include <NimBLEDevice.h>

// ESP32 BLE diagnostic only. Never writes, prints, or changes GPIO outputs.
// NimBLE-Arduino 2.x required. Not compiled or hardware verified.
static const NimBLEUUID kService("e7810a71-73ae-499d-8c15-faa9aef0c3f2");
static const NimBLEUUID kCharacteristic("bef8d6c9-9c21-4c9e-b632-bd58c1009f9f");
static NimBLEClient* client = nullptr;
static void notifyCallback(NimBLERemoteCharacteristic*, uint8_t* data, size_t length, bool) {
  Serial.printf("Notify: %u bytes: ", (unsigned)length);
  for (size_t i=0; i<length; ++i) Serial.printf("%02X ", data[i]);
  Serial.println();
}

void setup() {
  Serial.begin(115200);
  delay(1200);
  Serial.println("B3S BLE diagnostic v3: read-only, no handshake, no printing");
  NimBLEDevice::init("Lottery-Diagnostic");
  NimBLEScan* scan = NimBLEDevice::getScan();
  scan->setActiveScan(true);
  NimBLEScanResults found = scan->getResults(10000, false);
  Serial.printf("Found %d BLE devices\n", found.getCount());
  int candidate = -1;
  for (int i=0; i<found.getCount(); ++i) {
    const NimBLEAdvertisedDevice* dev = found.getDevice(i);
    bool service = dev->isAdvertisingService(kService);
    Serial.printf("[%d] name=%s address=%s rssi=%d advertises-service=%s\n", i,
      dev->getName().c_str(), dev->getAddress().toString().c_str(), dev->getRSSI(), service?"yes":"no");
    if (service && candidate < 0) candidate = i;
  }
  // Do not automatically connect if there are multiple devices with this service.
  int count = 0;
  for (int i=0; i<found.getCount(); ++i)
    if (found.getDevice(i)->isAdvertisingService(kService)) ++count;
  if (count != 1 || candidate < 0) {
    Serial.println("Not exactly one NIIMBOT service candidate. No connection attempted.");
    return;
  }
  const NimBLEAdvertisedDevice* dev = found.getDevice(candidate);
  Serial.printf("Connecting to service candidate %s\n", dev->getAddress().toString().c_str());
  client = NimBLEDevice::createClient();
  if (!client->connect(dev)) { Serial.println("Connection failed"); return; }
  NimBLERemoteService* svc = client->getService(kService);
  if (!svc) { Serial.println("Service not accessible"); client->disconnect(); return; }
  NimBLERemoteCharacteristic* ch = svc->getCharacteristic(kCharacteristic);
  if (!ch) { Serial.println("Characteristic not found"); client->disconnect(); return; }
  Serial.printf("Connected. characteristic read=%d write=%d writeNoResponse=%d notify=%d\n",
    ch->canRead(), ch->canWrite(), ch->canWriteNoResponse(), ch->canNotify());
  if (ch->canNotify()) {
    bool subscribed = ch->subscribe(true, notifyCallback);
    Serial.printf("Subscribe notification: %s\n", subscribed?"yes":"no");
  }
  Serial.println("Read-only diagnostics complete. NO commands sent to printer.");
}
void loop() { delay(1000); }
