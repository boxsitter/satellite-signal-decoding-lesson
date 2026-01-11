# satellite-signal-decoding-lesson
A lesson for K-16 students with intermediate skills in Python.

In this lesson, students act as mission control operators tasked with decoding a transmission from a NOAA weather satellite to identify signs any extraterrestrial alien activity surrounding earth and verify the safety of the planet. This repo contains a simple website that hosts a raw satellite signal (a pre-recorded audio file) and an embedded Python environment. The core challenge is that the incoming data stream is not being processed correctly by the incomplete (the full decoder code is intentionally broken in various ways for students to fix) code given to students. The output image at the start of the activity is garbled and indiscernible. Students must edit a real Python script to fix various bugs. They are given a simplified manual, viewable in the website, with information on how the analog image in encoded into the radio signal and how it must be decoded. Using the manual, they must apply their knowledge of Python scripting to correctly decode the signal and display an image of earth.

This repository will have two components
    - A python script to take a wav file recording of a NOAA weather satellite transmission and output an image. There will be a complete "master" script and various "student" varying in difficulty. The student versions will have code removed, bugs introduced, values tampered with, ect.
    - A simple website containing the signal recording the students will be working with, a live python environment that can load in a selected student version of the decoding code, a simplified manual explaining how the signal works and what needs to be done to decode it, and the ability to view the vinal outputted image from the live python environment.


The decoder will be based off this incredible blog post by Charles Mercieca and the NOAA APT software by Martin Bernardi

https://www.charlesmercieca.com/post/2024-11-23-manually-decoding-a-noaa-apt-transmission/
https://github.com/martinber/noaa-apt