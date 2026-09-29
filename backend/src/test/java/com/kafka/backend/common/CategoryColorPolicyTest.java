package com.kafka.backend.common;

import com.kafka.backend.activitycategory.ActivityCategory;
import com.kafka.backend.activitycategory.ActivityCategoryRepository;
import com.kafka.backend.activitycategory.ActivityCategoryService;
import com.kafka.backend.lifecategory.LifeCategory;
import com.kafka.backend.lifecategory.LifeCategoryRepository;
import com.kafka.backend.lifecategory.LifeCategoryService;
import com.kafka.backend.lifetime.LifeTimeEntryRepository;
import com.kafka.backend.plannedtimeblock.PlannedTimeBlockRepository;
import com.kafka.backend.supplementalwork.SupplementalWorkEntryRepository;
import com.kafka.backend.worktimeentry.WorkTimeEntryRepository;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class CategoryColorPolicyTest {
    final UUID user = UUID.randomUUID();
    final ActivityCategoryRepository work = mock(ActivityCategoryRepository.class);
    final LifeCategoryRepository life = mock(LifeCategoryRepository.class);
    final ActivityCategoryService workService = new ActivityCategoryService(work, () -> user,
            mock(WorkTimeEntryRepository.class), mock(PlannedTimeBlockRepository.class), mock(SupplementalWorkEntryRepository.class));
    final LifeCategoryService lifeService = new LifeCategoryService(life, () -> user,
            mock(LifeTimeEntryRepository.class), mock(PlannedTimeBlockRepository.class));

    @Test void initialColorIsSemanticAndMatchesTheV65Backfill() {
        // Independently computed: palette[md5(key)[0..4] as uint32 % 6], key = DOMAIN:lower(trim(NFC(name))).
        assertThat(CategoryColor.initialColor("WORK", "개발")).isEqualTo("#679aa7");
        assertThat(CategoryColor.initialColor("WORK", "업무")).isEqualTo("#48a78a");
        assertThat(CategoryColor.initialColor("LIFE", "운동")).isEqualTo("#679aa7");
        assertThat(CategoryColor.initialColor("WORK", " Project Orbit ")).isEqualTo("#d5a344");
        // Same logical category in two environments (different UUIDs) → same color.
        ActivityCategory dev = new ActivityCategory(user, "개발", null, false), prod = new ActivityCategory(UUID.randomUUID(), "개발", null, false);
        assertThat(dev.getId()).isNotEqualTo(prod.getId());
        assertThat(dev.getColor()).isEqualTo(prod.getColor()).isEqualTo("#679aa7");
        assertThat(dev.getColorCustomized()).isFalse();
    }

    @Test void rootsPersistAColorAtCreationAndChildrenInherit() {
        ActivityCategory root = new ActivityCategory(user, "개발", null, false);
        when(work.findByIdAndUserId(root.getId(), user)).thenReturn(Optional.of(root));
        when(work.save(any())).thenAnswer(i -> i.getArgument(0));
        assertThat(workService.create("업무", null).getColor()).isEqualTo("#48a78a");
        assertThat(workService.create("Project Orbit", root.getId()).getColor()).isNull();
        LifeCategory lifeRoot = new LifeCategory(user, "운동", false);
        assertThat(lifeRoot.getColor()).isEqualTo("#679aa7");
        assertThat(new LifeCategory(user, "러닝", lifeRoot.getId(), false).getColor()).isNull();
    }

    @Test void renameAndReorderNeverRecolorAPersistedColor() {
        ActivityCategory a = new ActivityCategory(user, "개발", null, false), b = new ActivityCategory(user, "업무", null, false);
        String colorA = a.getColor(), colorB = b.getColor();
        when(work.findByIdAndUserId(a.getId(), user)).thenReturn(Optional.of(a));
        when(work.save(any())).thenAnswer(i -> i.getArgument(0));
        when(work.findByUserIdOrderBySortOrderAscNameAsc(user)).thenReturn(List.of(a, b));
        when(work.findByUserIdAndParentIdIsNull(user)).thenReturn(List.of(a, b));
        workService.rename(a.getId(), "완전히 다른 이름");
        workService.reorder(null, List.of(b.getId(), a.getId()));
        assertThat(a.getColor()).isEqualTo(colorA);
        assertThat(b.getColor()).isEqualTo(colorB);
    }

    @Test void ownerEditPersistsAndResetFollowsHierarchy() {
        LifeCategory root = new LifeCategory(user, "운동", false), child = new LifeCategory(user, "러닝", root.getId(), false);
        when(life.findByIdAndUserId(root.getId(), user)).thenReturn(Optional.of(root));
        when(life.findByIdAndUserId(child.getId(), user)).thenReturn(Optional.of(child));
        when(life.save(any())).thenAnswer(i -> i.getArgument(0));
        assertThat(lifeService.setColor(root.getId(), " #AABBCC ", false).getColor()).isEqualTo("#aabbcc");
        assertThat(root.getColorCustomized()).isTrue();
        lifeService.setColor(child.getId(), "#112233", false);
        assertThat(child.getColor()).isEqualTo("#112233");
        lifeService.setColor(child.getId(), null, false);
        assertThat(child.getColor()).isNull();
        assertThat(child.getColorCustomized()).isFalse();
        lifeService.setColor(root.getId(), null, false);
        assertThat(root.getColor()).isEqualTo("#679aa7");
        assertThat(root.getColorCustomized()).isFalse();
        assertThatThrownBy(() -> lifeService.setColor(root.getId(), "red", false)).isInstanceOf(InvalidRequestException.class);
    }

    @Test void legacyBrowserImportNeverOverridesAnOwnerChosenColor() {
        ActivityCategory generated = new ActivityCategory(user, "개발", null, false), chosen = new ActivityCategory(user, "업무", null, false);
        chosen.changeColor("#123456");
        when(work.findByIdAndUserId(generated.getId(), user)).thenReturn(Optional.of(generated));
        when(work.findByIdAndUserId(chosen.getId(), user)).thenReturn(Optional.of(chosen));
        when(work.save(any())).thenAnswer(i -> i.getArgument(0));
        workService.setColor(generated.getId(), "#abcdef", true);
        workService.setColor(chosen.getId(), "#abcdef", true);
        assertThat(generated.getColor()).isEqualTo("#abcdef");
        assertThat(generated.getColorCustomized()).isTrue();
        assertThat(chosen.getColor()).isEqualTo("#123456");
    }

    @Test void listPersistsAColorOnlyForUncoloredRoots() {
        ActivityCategory root = new ActivityCategory(user, "개발", null, false);
        when(work.findByUserIdOrderBySortOrderAscNameAsc(user)).thenReturn(List.of(root));
        workService.list();
        verify(work, never()).saveAll(anyList());
    }
}
