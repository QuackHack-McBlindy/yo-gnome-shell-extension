# **yo-gnome-shell-extension**

[![Sponsors](https://img.shields.io/github/sponsors/QuackHack-McBlindy?logo=githubsponsors&label=Sponsor&style=flat&labelColor=ff1493&logoColor=fff&color=rgba(234,74,170,0.5) "")](https://github.com/sponsors/QuackHack-McBlindy) [![Buy Me a Coffee](https://img.shields.io/badge/Buy%20Me%20a%20Coffee-Sponsor?style=flat&logo=buymeacoffee&logoColor=fff&labelColor=ff1493&color=ff1493)](https://buymeacoffee.com/quackhackmcblindy)

<br>

![Yo demo](Screenshots/yo.png)



**This  is a GNOME desktop widget for <a href="https://github.com/QuackHack-McBlindy/yo">yo</a>.**

This widget let's users control their clients microphone gain, mute/unmute and also output the clients microphone audio on the users speakers.<br> 


<br>
<br>

## **Installation**


```bash
git clone https://github.com/QuackHack-McBlindy/yo-gnome-shell-extension.git
cd yo-gnome-shell-extension
bash install.sh
```


<details><summary><strong>
❄️ Installing Using Flakes (NixOS)
</strong></summary>


#### **Add yo-gnome-shell-extension as an input in your flake:**

```nix
  inputs = {
    nixpkgs.url   = "github:NixOS/nixpkgs/nixos-unstable";
    yo-gnome-shell-extension.url = "github:quackhack-mcblindy/yo-gnome-shell-extension";
  };
```

<br>
The flake provides the extension as a package.<br>

```nix
{
  environment.systemPackages = [ inputs.yo-gnome-shell-extension.packages.${pkgs.system}.default ];
}
```

</details>

<br>

## **License**

This project is licensed under the terms of the MIT license.<br>
See the `LICENSE` file in the repository for full details.<br>

Contributions are welcomed.

