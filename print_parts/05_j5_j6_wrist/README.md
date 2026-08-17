# J5 and J6 differential wrist

The differential wrist: fork, carrier, spools and tool flange.

Print these in the order the files are numbered. Settings below are what the part is designed for, not a suggestion - the material choice in particular matters, see the note at the bottom.

1. **HollowInputShaft A** - ASA, 0.20 mm layers, 5 perimeters, 30% infill, no supports. Orientation: largest face on the bed, X axis vertical.
2. **60T HTD3M InputPulley A** - PETG, 0.15 mm layers, 4 perimeters, 60% infill, no supports. Orientation: gear axis vertical so the teeth need no supports.
3. **DiffInputClampCollar A** - ASA, 0.20 mm layers, 4 perimeters, 30% infill, no supports. Orientation: bearing bore vertical so it stays round without supports.
4. **HollowInputShaft B** - ASA, 0.20 mm layers, 5 perimeters, 30% infill, no supports. Orientation: largest face on the bed, X axis vertical.
5. **60T HTD3M InputPulley B** - PETG, 0.15 mm layers, 4 perimeters, 60% infill, no supports. Orientation: gear axis vertical so the teeth need no supports.
6. **DiffInputClampCollar B** - ASA, 0.20 mm layers, 4 perimeters, 30% infill, no supports. Orientation: bearing bore vertical so it stays round without supports.
7. **DifferentialFork Left** - ASA, 0.20 mm layers, 5 perimeters, 30% infill, supports on overhangs only. Orientation: largest face on the bed, Y axis vertical.
8. **DifferentialFork Right** - ASA, 0.20 mm layers, 5 perimeters, 30% infill, supports on overhangs only. Orientation: largest face on the bed, Y axis vertical.
9. **HardStop J5 MIN** - ASA, 0.20 mm layers, 3 perimeters, 30% infill, no supports. Orientation: largest face on the bed, Y axis vertical.
10. **HardStop J5 MAX** - ASA, 0.20 mm layers, 3 perimeters, 30% infill, no supports. Orientation: largest face on the bed, Y axis vertical.
11. **DiffInputBearingRetainer A** - ASA, 0.20 mm layers, 4 perimeters, 30% infill, no supports. Orientation: bearing bore vertical so it stays round without supports.
12. **DiffInputBearingRetainer B** - ASA, 0.20 mm layers, 4 perimeters, 30% infill, no supports. Orientation: bearing bore vertical so it stays round without supports.
13. **J5 PitchBearingHousing A** - ASA, 0.20 mm layers, 4 perimeters, 60% infill, supports on overhangs only. Orientation: bearing bore vertical so it stays round without supports.
14. **J5 PitchBearingHousing B** - ASA, 0.20 mm layers, 4 perimeters, 60% infill, supports on overhangs only. Orientation: bearing bore vertical so it stays round without supports.
15. **DifferentialCarrier SeparatedBearingStack** - ASA, 0.20 mm layers, 5 perimeters, 30% infill, supports on overhangs only. Orientation: largest face on the bed, Z axis vertical.
16. **HardStopStriker J5** - ASA, 0.20 mm layers, 3 perimeters, 30% infill, no supports. Orientation: largest face on the bed, Z axis vertical.
17. **HomeSwitchBracket J6** - PETG, 0.15 mm layers, 4 perimeters, 30% infill, supports on overhangs only. Orientation: largest face on the bed, X axis vertical.
18. **J6 HollowD12 DFlatShaft 8mmBore** - ASA, 0.20 mm layers, 5 perimeters, 30% infill, no supports. Orientation: largest face on the bed, Y axis vertical.
19. **HomeFlag J6** - PETG, 0.20 mm layers, 3 perimeters, 30% infill, no supports. Orientation: largest face on the bed, X axis vertical.
20. **24T m2 StraightBevelJ6 DFlat** - PETG, 0.15 mm layers, 4 perimeters, 60% infill, no supports. Orientation: gear axis vertical so the teeth need no supports.
21. **J6 DFlatToolHub R28** - ASA, 0.20 mm layers, 4 perimeters, 60% infill, no supports. Orientation: bearing bore vertical so it stays round without supports.
22. **ISO50 ToolFlange Counterbored** - ASA, 0.20 mm layers, 5 perimeters, 60% infill, no supports. Orientation: largest face on the bed, X axis vertical.
23. **J6 RearBearingRetainer CSK** - ASA, 0.20 mm layers, 4 perimeters, 30% infill, no supports. Orientation: bearing bore vertical so it stays round without supports.
24. **CapsuleSlipRingClamp M125** - ASA, 0.20 mm layers, 4 perimeters, 30% infill, no supports. Orientation: largest face on the bed, X axis vertical.
25. **J6 FrontBearingRetainer CSK** - ASA, 0.20 mm layers, 4 perimeters, 30% infill, no supports. Orientation: bearing bore vertical so it stays round without supports.
26. **OV5693 CameraMount Upper** - ASA, 0.20 mm layers, 5 perimeters, 40% infill, no supports. Orientation: plochou svěrky na podložku; M2 drážky svisle.
27. **OV5693 CameraClamp Lower** - ASA, 0.20 mm layers, 5 perimeters, 40% infill, no supports. Orientation: plochou čelisti na podložku; otevřený U výřez nahoru.
28. **OV5693 CameraGuard** - ASA, 0.20 mm layers, 4 perimeters, 40% infill, no supports. Orientation: zadní plochou na podložku; otvor objektivu bez podpěr.

ASA parts sit in the load path or next to a motor. Stepper bodies run hot enough that PLA creeps there under the permanent load every bolted joint carries, so those parts are not a place to save money. PETG parts are covers, gears, pulleys and brackets.

## Camera module

Final camera: [RGB USB UVC OV5693 5MP on AliExpress](https://pl.aliexpress.com/item/1005005603460226.html?gatewayAdapt=glo2pol). Use the 32–38 mm PCB clamp range and focus the M12 lens after the camera is bolted to the fixed J5 carrier.

Camera hardware: 2x M3x20 clamp screw, 4x M2x8 PCB screw, four 3–4 mm spacers and 2x M3x8 guard screw. Route USB rearward with strain relief and a J5 service loop; never through J6.
