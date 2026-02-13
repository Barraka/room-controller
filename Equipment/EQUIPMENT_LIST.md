# Escape Room Equipment List

**Escape Yourself - GM Manager System**
*Document de référence pour l'équipement des props*

---

## 1. Room Controller (MiniPC)

Le Room Controller est le cerveau du système. Il exécute le serveur Node.js, le broker MQTT, et sert l'interface d'administration.

| Équipement | Description | Options | Prix estimé |
|------------|-------------|---------|-------------|
| **Raspberry Pi 5** | Microordinateur pour Room Controller | 4GB ou 8GB RAM | 70-90 € |
| **NVMe SSD HAT + SSD** | Stockage fiable (mieux que carte SD) | 128GB+ NVMe | 40-60 € |
| **Alimentation Pi 5** | Alimentation officielle 27W USB-C | Obligatoire pour Pi 5 | 15 € |
| **Boîtier Pi avec refroidissement** | Protection et refroidissement | Official Active Cooler | 15 € |
| *Alternative :* **Mini PC** | Option plus puissante | Beelink Mini S12 Pro | 150-250 € |

**Fournisseurs :**
- Kubii.com (spécialiste Raspberry Pi France)
- LDLC.com
- Amazon.fr

---

## 2. Réseau

| Équipement | Description | Modèle recommandé | Prix estimé |
|------------|-------------|-------------------|-------------|
| **Routeur WiFi** | Réseau pour props + laptop GM | TP-Link Archer AX23 | 60 € |
| **Câbles Ethernet** | Connexion filaire Pi + laptop GM | Cat6, diverses longueurs | 10-20 € |

**Configuration importante :**
- Utiliser la bande 2.4 GHz pour les ESP32
- Canal WiFi fixe (1, 6, ou 11)
- Réservation IP statique (DHCP reservation)

---

## 3. Alimentation Centralisée

### 5V — ESP32 (Recommandé)

Un seul bloc d'alimentation 5V alimente tous les ESP32 de la salle via un bornier de distribution. Beaucoup plus propre que des chargeurs USB individuels.

| Équipement | Description | Modèle recommandé | Prix estimé |
|------------|-------------|-------------------|-------------|
| **Alimentation 5V 10A** | PSU centralisée pour ESP32 | Mean Well LRS-50-5 | 15 € |
| **Bornier de distribution** | Répartir 5V/GND vers chaque prop | Bornier DIN 10 voies | 8 € |
| **Câble 18 AWG (tronc)** | Du PSU au bornier de distribution | 2 conducteurs, rouge/noir | 5 € /5m |
| **Câble 22 AWG (branches)** | Du bornier à chaque ESP32 | 2 conducteurs | 20 € /100m |

**Dimensionnement :** Un ESP32 avec WiFi consomme ~300mA typique, 500mA en pointe.
- 12 ESP32 = ~3.6A typique / 6A pointe
- Mean Well LRS-50-5 (10A) → marge confortable pour 12-15 ESP32
- Si besoin de plus : Mean Well LRS-100-5 (18A, ~25 €)

**Câblage vers ESP32 :** Brancher sur le pin **5V/VIN + GND** du breakout board (pas via USB).

### 12V — Maglocks, Solénoïdes, LED

Rail séparé pour les charges 12V (ne pas mélanger avec le 5V des ESP32).

| Équipement | Description | Modèle recommandé | Prix estimé |
|------------|-------------|-------------------|-------------|
| **Alimentation 12V 4.2A** | PSU pour maglocks | Mean Well LRS-50-12 | 15 € |
| **Bornier de distribution** | Répartir 12V vers les MOSFETs | Bornier DIN 10 voies | 8 € |
| **Porte-fusibles + fusibles** | Protection par prop | 5x20mm, fusibles 2A | 10 € |
| **Câble 18 AWG (tronc)** | Du PSU au bornier | 2 conducteurs, rouge/noir | 5 € /5m |
| **Câble 20 AWG (branches)** | Du bornier au MOSFET (VIN) | 2 conducteurs | 10 € /25m |

**Dimensionnement :** Un maglock 60kg consomme ~200-300mA.
- 8 maglocks = ~2A typique
- Mean Well LRS-50-12 (4.2A) → marge suffisante
- Si beaucoup de maglocks : Mean Well LRS-100-12 (8.5A, ~25 €)

### Option Autonome (déconseillée en production)

Pour prototypage ou props isolés seulement.

| Équipement | Description | Prix estimé |
|------------|-------------|-------------|
| **Chargeurs USB 5V** | Alimenter ESP32 individuellement | 5-10 € /pièce |
| **Adaptateur 12V 2A** | Alimenter maglock individuellement | 8 € /pièce |

---

## 5. Onduleur (UPS)

| Équipement | Description | Modèle recommandé | Prix estimé |
|------------|-------------|-------------------|-------------|
| **Onduleur** | Protection contre coupures | APC Back-UPS 400VA | 50 € |

---

## 6. Microcontrôleur ESP32

| Équipement | Description | Prix estimé |
|------------|-------------|-------------|
| **ESP32 DevKit** | Cerveau de chaque prop | 5-8 € |
| **ESP32 avec headers** | Pré-soudé pour breadboard | 6-10 € |

**Note :** L'ESP32 utilise une logique 3.3V. Choisir des modules compatibles 3.3V.

---

## 7. Modules de Commutation (Maglocks)

Pour contrôler les maglocks 12V depuis l'ESP32 (GPIO 3.3V).

| Équipement | Borniers à vis | Logique | Prix | Recommandation |
|------------|----------------|---------|------|----------------|
| **HW-548 (IRF5305S, P-channel)** | ✅ 6 borniers à vis | Active-LOW (`activeLow = true`) | 3 € | **Recommandé** |
| **XY-MOS (N-channel)** | ⚠️ VIN/OUT seulement (signal = trous nus) | Active-HIGH (`activeLow = false`) | 3 € | Nécessite soudure |
| **Module Relais 5V** | ✅ Borniers | Opto-isolé | 2 € | Simple mais bruyant |

### HW-548 — Module Recommandé

- **6 connexions par borniers à vis** : aucune soudure nécessaire
- Signal : 3V-20V (compatible ESP32 3.3V)
- Charge : DC 5-36V (maglocks 12V, solénoïdes)
- P-channel = **LOW = ON** → config firmware : `activeLow = true`
- ~3-5 € le pack de 2-3 sur Amazon

### Diode Flyback

La diode flyback protège le MOSFET contre les pics de tension quand le maglock s'éteint. Si votre module n'en a pas, ajoutez une **1N4007** :
- Cathode (bande argentée) → borne + du maglock
- Anode → borne - du maglock

---

## 8. Capteurs

| Équipement | Usage | Interface | Prix estimé |
|------------|-------|-----------|-------------|
| **Module RFID RC522** | Lecture tags/cartes RFID | SPI (3.3V) | 3-5 € |
| **Tags/Cartes RFID** | Déclencher capteur RFID | 13.56MHz Mifare | 5 € /lot |
| **Capteur magnétique porte** | Détecter ouverture porte/tiroir | GPIO digital | 2 € |
| **Bouton poussoir** | Déclencheur manuel | GPIO digital | 1 € |
| **Interrupteur Reed** | Détection aimant | GPIO digital | 1-2 € |

---

## 9. Actionneurs

| Équipement | Usage | Tension | Prix estimé |
|------------|-------|---------|-------------|
| **Serrure électromagnétique (Maglock)** | Verrouiller portes/tiroirs | 12V DC | 10-15 € |
| **Serrure solénoïde** | Petit mécanisme de verrou | 12V DC | 5-10 € |
| **Ruban LED** | Effets lumineux | 12V DC | 10-20 € /5m |
| **Servomoteur** | Petit mouvement mécanique | 5V | 3-5 € |

### Spécifications Maglock

| Type | Force de maintien | Consommation |
|------|-------------------|--------------|
| Mini/Petit | 60 kg (130 lbs) | 150-250 mA |
| Moyen | 180 kg (400 lbs) | 300-500 mA |
| Grand | 280 kg (600 lbs) | 400-600 mA |

**Recommandation :** Pour escape room, les maglocks 60 kg suffisent largement.

---

## 10. Câblage et Connecteurs

### Câbles de signal (capteurs)

| Type de câble | AWG | Usage | Prix estimé |
|---------------|-----|-------|-------------|
| **2 conducteurs 22 AWG (0.5mm²)** | 22 | Reed switches, boutons, capteurs magnétiques | 20 € /100m |
| **4 conducteurs 22 AWG (0.5mm²)** | 22 | Modules RFID (VCC + GND + signal + spare) | 18 € /50m |
| **2 conducteurs 20 AWG (0.75mm²)** | 20 | Maglocks, solénoïdes (courant plus élevé, runs > 5m) | 10 € /25m |

> **Note :** Le câble d'alarme 22 AWG est idéal pour les runs capteurs — conçu pour le bas-voltage en installation encastrée.

### Câbles d'alimentation (PSU → distribution)

| Type de câble | AWG | Usage | Prix estimé |
|---------------|-----|-------|-------------|
| **2 conducteurs 18 AWG (1.0mm²)** | 18 | Tronc : PSU → bornier de distribution | 5 € /5m |
| **2 conducteurs 22 AWG (0.5mm²)** | 22 | Branches : bornier → ESP32 (5V/GND) | Inclus dans câble capteur |

### Connecteurs

| Équipement | Usage | Prix estimé |
|------------|-------|-------------|
| **Connecteurs Wago 221** | Connexions rapides sans soudure, distribution | 15 € /lot |
| **Borniers à vis** | Connexions permanentes | 5-10 € |
| **Presse-étoupes PG7** | Passage de câble dans les boîtiers props | 3 € /lot de 10 |
| **Gaine thermorétractable** | Isoler connexions | 5 € |
| **Fils Dupont** | Prototypage uniquement | 5 € /lot |

---

## 11. Outils (si nécessaire)

| Outil | Usage |
|-------|-------|
| **Fer à souder** | Souder fils, headers |
| **Multimètre** | Tester tension, continuité |
| **Pince à dénuder** | Dénuder isolation fils |
| **Pince à sertir** | Pour connecteurs JST/Dupont |

---

## 12. Liste d'Achat - Salle "Magie" Complète (12 props)

### A. Microcontrôleurs (14 unités = 12 props + 2 spare)

| Équipement | Qté | Prix unitaire | Total |
|------------|-----|---------------|-------|
| ESP32 DevKit V1 | 14 | 6 € | 84 € |
| Breakout board borniers à vis | 14 | 2 € | 28 € |
| **Sous-total** | | | **~112 €** |

### B. Modules MOSFET (12 props avec maglock/solénoïde)

| Équipement | Qté | Prix unitaire | Total |
|------------|-----|---------------|-------|
| HW-548 MOSFET (pack de 3) | 5 | 5 € | 25 € |
| **Sous-total** | | | **~25 €** |

> 5 packs × 3 = 15 modules (12 utilisés + 3 spare)

### C. Boîtiers et montage

| Équipement | Qté | Prix unitaire | Total |
|------------|-----|---------------|-------|
| Boîtier ABS 150×100×60mm | 14 | 3 € | 42 € |
| Presse-étoupes PG7 (lot de 10) | 2 | 3 € | 6 € |
| Entretoises nylon M3 (lot) | 1 | 5 € | 5 € |
| **Sous-total** | | | **~53 €** |

### D. Alimentation centralisée

| Équipement | Qté | Prix unitaire | Total |
|------------|-----|---------------|-------|
| Mean Well LRS-50-5 (5V 10A) | 1 | 15 € | 15 € |
| Mean Well LRS-50-12 (12V 4.2A) | 1 | 15 € | 15 € |
| Bornier DIN de distribution (10 voies) | 2 | 8 € | 16 € |
| Câble 18 AWG 2-conducteurs (5m) | 1 | 5 € | 5 € |
| **Sous-total** | | | **~51 €** |

### E. Câblage

| Équipement | Qté | Prix unitaire | Total |
|------------|-----|---------------|-------|
| Câble alarme 22 AWG 2-conducteurs (100m) | 1 | 20 € | 20 € |
| Câble alarme 22 AWG 4-conducteurs (50m) | 1 | 18 € | 18 € |
| Câble 20 AWG 2-conducteurs maglocks (25m) | 1 | 10 € | 10 € |
| Connecteurs Wago 221 (lot) | 1 | 15 € | 15 € |
| Fil 22 AWG solid-core pour câblage interne (10m) | 1 | 5 € | 5 € |
| Câbles USB-C pour flashing initial (2m) | 2 | 5 € | 10 € |
| **Sous-total** | | | **~78 €** |

### F. Étiquetage

| Équipement | Qté | Prix unitaire | Total |
|------------|-----|---------------|-------|
| Étiquettes plastifiées ou P-Touch | 1 | 10 € | 10 € |
| **Sous-total** | | | **~10 €** |

### Récapitulatif Salle "Magie"

| Catégorie | Total |
|-----------|-------|
| A. Microcontrôleurs | 112 € |
| B. MOSFET | 25 € |
| C. Boîtiers | 53 € |
| D. Alimentation centralisée | 51 € |
| E. Câblage | 78 € |
| F. Étiquetage | 10 € |
| **TOTAL salle "Magie"** | **~329 €** |

> *Hors capteurs (RFID, aimants, boutons) et actionneurs (maglocks, solénoïdes) — ceux-ci dépendent des puzzles spécifiques de chaque prop.*

---

## 13. Liste d'Achat - Room Controller Complet

| Équipement | Qté | Prix unitaire | Total |
|------------|-----|---------------|-------|
| Raspberry Pi 5 (8GB) | 1 | 90 € | 90 € |
| NVMe HAT + SSD 128GB | 1 | 50 € | 50 € |
| Alimentation Pi 5 27W | 1 | 15 € | 15 € |
| Boîtier Active Cooler | 1 | 15 € | 15 € |
| Routeur TP-Link Archer AX23 | 1 | 60 € | 60 € |
| Câbles Ethernet | 3 | 5 € | 15 € |
| Onduleur APC 400VA | 1 | 50 € | 50 € |
| **TOTAL** | | | **~295 €** |

---

## 15. Fournisseurs Recommandés

### France

| Fournisseur | Spécialité | Site |
|-------------|------------|------|
| **Kubii** | Raspberry Pi, composants | kubii.com |
| **LDLC** | Informatique, composants | ldlc.com |
| **Amazon.fr** | Général | amazon.fr |
| **Mouser** | Composants électroniques pro | mouser.fr |

### International

| Fournisseur | Spécialité | Site |
|-------------|------------|------|
| **Adafruit** | Modules Arduino/ESP32 de qualité | adafruit.com |
| **AliExpress** | Composants pas chers (délai long) | aliexpress.com |
| **Pololu** | Modules robotique | pololu.com |

---

## 16. Schéma de Câblage - Installation Complète

```
   ┌── Armoire technique ──────────────────────────────────────────┐
   │                                                               │
   │   [PSU 5V 10A]──18AWG──► [Bornier 5V] ──22AWG──► vers props  │
   │   [PSU 12V 4A]──18AWG──► [Bornier 12V]──20AWG──► vers props  │
   │                                                               │
   └───────────────────────────────────────────────────────────────┘
          │ 5V          │ 12V
          │ 22AWG       │ 20AWG
          ▼             ▼
   ┌── Boîtier Prop (ABS) ────────────────────────────┐
   │                                                   │
   │  5V ──► [ESP32 + breakout borniers]               │
   │  GND──►      │ GPIO ──22AWG──► [HW-548 MOSFET]   │
   │              │ GND  ──22AWG──►      │             │
   │              │                   VIN ◄── 12V      │
   │              │ GPIOs capteurs    OUT ──► Maglock   │
   │              │                                    │
   └──────────────┼────────────────────────────────────┘
                  │
             cable gland (PG7)
                  │
          câble alarme 22AWG
             vers capteurs
        (dans murs / meubles)
```

### Schéma Simplifié - Prop Sans Maglock

```
   ┌── Boîtier Prop (ABS) ─────────────┐
   │                                    │
   │  5V ──► [ESP32 + breakout]         │
   │  GND──►      │ GPIOs capteurs      │
   │              │                     │
   └──────────────┼─────────────────────┘
                  │
          câble alarme 22AWG
             vers capteurs
```

---

## 17. Checklist Avant Achat

- [ ] Vérifier compatibilité 3.3V pour tous les modules
- [ ] Prévoir diodes flyback si modules MOSFET sans protection
- [ ] Choisir ESP32 avec headers pré-soudés (pas de soudure nécessaire)
- [ ] Choisir HW-548 (borniers à vis) plutôt que XY-MOS (trous nus)
- [ ] Mesurer les runs de câble pour chaque prop avant de couper
- [ ] Prévoir 2 ESP32 et 3 MOSFET de rechange
- [ ] Prévoir câbles de longueur suffisante

---

## Notes

- Les prix sont indicatifs et peuvent varier selon les fournisseurs
- AliExpress est moins cher mais les délais sont de 2-4 semaines
- Pour un premier test, Amazon/Kubii permet une livraison rapide
- Les maglocks 60kg sont suffisants pour 99% des applications escape room

---

*Document généré pour le projet Escape Yourself GM Manager*
*Dernière mise à jour : Février 2026*
