import 'package:flutter/material.dart';

import '../api/climate_api.dart';
import '../api/models.dart';
import '../screens/password_screens.dart';
import 'zchpc.dart';

/// The account sheet of the app bar: who is signed in, what they see, Change password and Sign out.
/// The same for a station account and a national one.
void showAccountSheet(BuildContext context, {required ClimateApi api, required User user, required VoidCallback onSignOut}) {
  showModalBottomSheet<void>(
    context: context,
    showDragHandle: true,
    isScrollControlled: true, // as tall as its content needs, scrolling on a short screen
    builder: (sheet) => SafeArea(
      child: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            ListTile(leading: const Icon(Icons.person_outline), title: Text(user.name), subtitle: Text(user.email)),
            ListTile(leading: const Icon(Icons.badge_outlined), title: Text(user.role), subtitle: Text('Access level ${user.level}')),
            if (user.station != null)
              ListTile(
                leading: const Icon(Icons.location_city_outlined),
                title: Text('${user.station!.code} ${user.station!.name}'),
                subtitle: Text(user.station!.type),
              )
            else if (user.isSuperuser)
              const ListTile(
                leading: Icon(Icons.public),
                title: Text('Every station'),
                subtitle: Text('National figures; open a station from Stations to see its records.'),
              ),
            ListTile(
              leading: const Icon(Icons.password),
              title: const Text('Change password'),
              onTap: () async {
                Navigator.of(sheet).pop();
                final message = await Navigator.of(context)
                    .push<String>(MaterialPageRoute(builder: (_) => ChangePasswordScreen(api: api), fullscreenDialog: true));
                if (context.mounted) showServerMessage(context, message);
              },
            ),
            const Divider(),
            ListTile(
              leading: const Icon(Icons.logout),
              title: const Text('Sign out'),
              onTap: () {
                Navigator.of(sheet).pop();
                onSignOut();
              },
            ),
            const Padding(padding: EdgeInsets.fromLTRB(16, 8, 16, 16), child: ZchpcCredit(compact: true)),
          ],
        ),
      ),
    ),
  );
}
