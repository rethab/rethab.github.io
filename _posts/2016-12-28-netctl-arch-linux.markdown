---
layout: post
title:  "Troubleshooting Netctl under Arch Linux"
date:   2016-12-28
categories: linux netctl arch wlan wpa
---

I recently had an issue connecting to a WLAN with my ArchLinux/Systemd/Netctl notebook.
While analyzing it, I found a few ways to troubleshoot issues with netctl.

For the following instructions and examples, please note that my wlan interface is called `wlp2s0` and may differ on your system.
You may get a list of interfaces with the command

```bash
$> ip link
```

### Is your profile loaded?

After I copied and adapted one of the profiles from `/etc/netctl/examples` and tried to switch to it, I got the following error message:

```Profile 'wlp2s0-33C3' does not exist or is not available```

The problem was that I did not reload netctl-auto.
This is how that can be done:

```bash
$> sudo systemctl restart netctl-auto@wlp2s0.service
```

It is usually handy to have the journal log running in a separate console while looking into issues of this sort.
When reloading netctl-auto for example, you could have the journal log running with

```bash
$> sudo journalctl -xef
```

If the profile was successfully loaded, you should see the output

```Dec 28 13:24:28 asus-rethab netctl-auto[3204]: Included profile 'wlp2s0-33C3'```

### Issues with the profile?

The ESSID of the network I was trying to connect to was `33C3`.
For some reason, I forgot to put this into quotes in the netctl profile so it would simply not be activated and keep falling back to some other default profile.
I figured this out by instructing netctl to tell me more about what it is doing with the environment variable `NETCTL_DEBUG` like so:

```bash
$> NETCTL_DEBUG=true sudo netctl-auto switch-to wlp2s0-33C3
```

This way I learned that `wpa_cli` was trying different networks and eventually seemed to fallback to the default.
So I ran `wpa_cli` manually to see which options it tried:

```bash
$> sudo wpa_cli -i wlp2s0 list_networks
```

This listed me all familiar networks plus one that was named `3\xc3` which lead me to suspect that something with the ESSID must be wrong.
