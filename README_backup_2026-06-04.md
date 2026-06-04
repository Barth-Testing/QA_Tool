## WSL2 Setup for Network Access
In wsl2 the default is a non bridged mode in comparison to wsl1. There is no dedicated solution to make the wsl distribution available in the network. 
A workaround is:
- to start the corresponding service on a specific port
- Add this port as an incoming firewall rule
-- TCP -Port 
- add a proxy setting to the Windows operating system running the wsl distribution
-- this has to be edited each time the ip address is changing 
- for this Powershell needs to be started with administrative rights and the following command needs to be edited with the corresponding ip and ports
- netsh interface portproxy add v4tov4 listenport=8083 (listening port) listenaddress=0.0.0.0 connectport=8083 (this is the corresponding port) connectaddress=172.30.219.247 (this is the ip address of the wsl distribution) 
- accessing the wsl is initiated via requesting the ip of the corresponding windows operating system and the port the firewall was enabled for
- windows just acts as a proxy in this case

## Metasploitable2 VM in virtualbox
- needs to be set up as a new virtual machine
- Linux 64 bit needs to be set
- the hard drive needs to be mapped to the to the existing metaploitable hard drive
- VM now can be started
- msfadmin used as username and pw
- the VM is only reachable through another VM as these run within the same sub net.
- to make it available through the network the network type needs to be set to bridged.