#!/usr/bin/zsh

strip_cruft () {
  base="$1";
  file="$2";

  n=$(echo "$file" | perl -p -i -e 's/^[A-Za-z0-9-]+-[Ll]\d+[Nn]ormal\d+[VHvh]//g');
  n=$(echo "$n" | perl -p -i -e 's/[ _:]/-/g');
  n=$(echo "$n" | perl -p -i -e 's/--/-/g');
  n=$(echo "$n" | perl -p -i -e 's/[^A-Za-z0-9-.]//g');
  n=$(echo "$n" | perl -ne 'print lc');
  mv "$file" "$n";
}

split () {
  cd $(dirname "$1");
  file=$(basename "$1");
  n="${file%.pdn}";

  mkdir "$n";
  mv "$file" "$n/$file";
  cd "$n";
  pdn2png.exe -split "$file";
  mv "$file" ".."

  for file (**/*.png) {
    strip_cruft "$n" "$file";
  }
}

split_all () {
  for file (**/*.pdn) {
    split "$file";
  }
}

if [ $1 ]; then
  echo "Splitting $1";
  split "$1";

else
  echo "Splitting all pdns in this directory recursively.";
  split_all;

fi
