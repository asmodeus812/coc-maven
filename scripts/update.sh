#!/bin/bash

echo "Cloning server sources"
git clone --depth=1 https://github.com/microsoft/vscode-maven.git

echo "Building server artifacts"
cd vscode-maven/jdtls.ext || exit
mvn clean install -DskipTests

echo "Copying server artifacts"
mkdir -p ../../server/
cp -rf com.microsoft.java.maven.plugin/target/com.microsoft.java.maven.plugin-*.jar ../../server/com.microsoft.java.maven.plugin.jar

echo "Cleaning resources"
cd .. || exit
rm -rf ../vscode-maven
